(function(global) {
    const { assets } = global.NCUTMap;

    function $(id) {
        return document.getElementById(id);
    }

    let toastTimer = null;

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
    }

    function closeModal() {
        const root = $('modal-root');
        if (!root) return;
        root.classList.add('hidden');
        root.style.display = '';
        root.innerHTML = '';
    }

    function openModal(title, bodyHtml, actionsHtml = '') {
        const root = $('modal-root');
        root.innerHTML = `
            <div class="modal-panel">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="ui-btn" data-close-modal>关闭</button>
                </div>
                ${bodyHtml}
                ${actionsHtml ? `<div class="modal-actions">${actionsHtml}</div>` : ''}
            </div>
        `;
        root.classList.remove('hidden');
        root.style.display = 'flex';
        root.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
        paintPixelIcons(root);
        return root;
    }

    function itemImageHtml(item, className = 'item-art') {
        if (item.type === 'skin') {
            return `<img class="${className}" src="${item.assetPath}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden')"><canvas class="pixel-art hidden" data-pixel-item="${item.id}" width="86" height="86"></canvas>`;
        }
        if (item.type === 'collectible') {
            return `<img class="${className}" src="${item.assetPath}" alt="${item.name}">`;
        }
        return `<img class="${className}" src="${assets.createPixelIconDataUrl(item.id)}" alt="${item.name}">`;
    }

    function skinPlaceholderDataUrl(color = '#4A90D9') {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.clearRect(0, 0, 96, 96);
        ctx.fillStyle = color;
        ctx.fillRect(34, 12, 28, 28);
        ctx.fillRect(26, 40, 44, 38);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(40, 22, 6, 6);
        ctx.fillRect(52, 22, 6, 6);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(42, 24, 2, 2);
        ctx.fillRect(54, 24, 2, 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(26, 12, 44, 66);
        return canvas.toDataURL('image/png');
    }

    function paintPixelIcons(root = document) {
        root.querySelectorAll('canvas[data-pixel-item]').forEach(canvas => {
            const item = assets.getItemById(canvas.dataset.pixelItem) || { type: 'skin', fallbackColor: '#4A90D9' };
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (item.type === 'skin') {
                ctx.fillStyle = item.fallbackColor || '#4A90D9';
                ctx.fillRect(28, 10, 30, 30);
                ctx.fillRect(22, 40, 42, 34);
                ctx.fillStyle = '#fff';
                ctx.fillRect(35, 20, 6, 6);
                ctx.fillRect(48, 20, 6, 6);
                ctx.fillStyle = '#222';
                ctx.fillRect(37, 22, 2, 2);
                ctx.fillRect(50, 22, 2, 2);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.strokeRect(22, 10, 42, 64);
            } else {
                assets.drawPixelIcon(ctx, item, 0, 0, canvas.width);
            }
        });
    }

    function renderLobby(profile, inventory, usingSupabase) {
        const currentSkin = profile.currentSkinItemId ? assets.getItemById(profile.currentSkinItemId) : null;
        const displayName = profile.nickname || profile.username || '玩家';
        $('lobby-nickname').textContent = displayName;
        $('coin-count').textContent = profile.ncutCoins;
        $('lobby-role-name').textContent = currentSkin?.name || assets.DEFAULT_SKIN.name;
        const bioText = profile.bio?.trim();
        const bioEl = document.getElementById('lobby-bio');
        if (bioEl) {
            bioEl.textContent = bioText || '暂无简介，点击编辑介绍自己。';
        }
        const roleImg = $('current-role-img');
        roleImg.src = currentSkin?.assetPath || assets.DEFAULT_SKIN_PATH;
        roleImg.onerror = () => {
            roleImg.onerror = null;
            roleImg.src = skinPlaceholderDataUrl(currentSkin?.fallbackColor || '#4A90D9');
        };
        $('supabase-status').textContent = '';
        document.getElementById('user-name').textContent = displayName;
        return { currentSkin, inventory };
    }

    function showRoleSelector(profile, inventory, onSelect) {
        const owned = new Set(inventory.map(entry => entry.itemId));
        const sorted = [...assets.skins].sort((a, b) => Number(!owned.has(a.id)) - Number(!owned.has(b.id)));
        const allRoles = [assets.DEFAULT_SKIN, ...sorted];
        const html = `<div class="role-grid">${allRoles.map(skin => {
            const isDefault = skin.isDefault;
            const unlocked = isDefault || owned.has(skin.id);
            const isSelected = isDefault ? !profile.currentSkinItemId : profile.currentSkinItemId === skin.id;
            const meta = isDefault
                ? `${skin.rarity}｜永久免费<br>已解锁，点击使用`
                : `${skin.rarity}｜收藏值 ${skin.collectionValue}<br>${unlocked ? '已解锁，点击使用' : '未解锁'}`;
            return `
                <button class="role-card ${unlocked ? '' : 'locked'} ${isSelected ? 'selected' : ''}" data-role-id="${isDefault ? '' : skin.id}" ${unlocked ? '' : 'disabled'}>
                    ${itemImageHtml(skin, 'role-art')}
                    <div class="item-name">${skin.name}</div>
                    <div class="item-meta">${meta}</div>
                </button>
            `;
        }).join('')}</div>`;
        const root = openModal('角色选择', html);
        root.querySelectorAll('[data-role-id]').forEach(btn => {
            btn.addEventListener('click', () => onSelect(btn.dataset.roleId || null));
        });
    }

    function showShop(inventory, onBuy, activeTab = 'all') {
        const owned = new Set(inventory.map(entry => entry.itemId));
        const skillsModule = global.NCUTMap.skills;
        const skillItems = skillsModule?.getShopSkillItems?.(inventory) || [];
        const skinItems = [...assets.skins];
        const toolItems = [
            ...assets.equipment.filter(item => item.purchasable !== false),
            ...assets.capacityItems,
            ...assets.renameItems,
        ];
        const tabItems = {
            all: [...skinItems, ...toolItems, ...skillItems],
            skin: skinItems,
            tool: toolItems,
            skill: skillItems,
        };
        const skillPriceGroups = [
            { price: skillsModule?.SKILL_PRICE_STANDARD ?? 527, label: '527 NCUT 币' },
            { price: skillsModule?.SKILL_PRICE_PREMIUM ?? 925, label: '925 NCUT 币' },
        ];

        function renderItemCard(item) {
            const isOwnedSkin = item.type === 'skin' && owned.has(item.id);
            const isOwnedSkill = (item.type === 'skill_active' || item.type === 'skill_passive') && owned.has(item.id);
            const isOwned = isOwnedSkin || isOwnedSkill;
            const skillTypeLabel = item.type === 'skill_active' ? '主动技能' : item.type === 'skill_passive' ? '被动技能' : '';
            const meta = item.type === 'skin'
                ? `${item.rarity}｜收藏值 ${item.collectionValue}<br>价格：${item.price} NCUT 币`
                : item.type === 'skill_active' || item.type === 'skill_passive'
                    ? `${skillTypeLabel}<br>${item.description || ''}<br>价格：${item.price} NCUT 币`
                    : `${item.description || ''}<br>价格：${item.price} NCUT 币`;
            const btnText = isOwned ? '已拥有' : '购买';
            return `
                <div class="item-card">
                    ${itemImageHtml(item)}
                    <div class="item-name">${item.name}</div>
                    <div class="item-meta">${meta}</div>
                    <button class="ui-btn accent" data-buy-id="${item.id}" ${isOwned ? 'disabled' : ''}>${btnText}</button>
                </div>
            `;
        }

        function renderItemList(items) {
            return items.length
                ? items.map(renderItemCard).join('')
                : '<p class="item-meta">暂无商品。</p>';
        }

        function renderSkillShopList(items) {
            if (!items.length) return '<p class="item-meta">暂无商品。</p>';

            const groupedHtml = skillPriceGroups.map(group => {
                const groupItems = items.filter(item => item.price === group.price);
                if (!groupItems.length) return '';
                return `
                    <section class="shop-skill-group">
                        <div class="shop-skill-group-title">${group.label}</div>
                        <div class="item-grid shop-skill-group-grid">${groupItems.map(renderItemCard).join('')}</div>
                    </section>
                `;
            }).join('');

            const knownPrices = new Set(skillPriceGroups.map(group => group.price));
            const otherItems = items.filter(item => !knownPrices.has(item.price));
            const otherHtml = otherItems.length
                ? `<div class="item-grid">${otherItems.map(renderItemCard).join('')}</div>`
                : '';

            return `<div class="shop-skill-groups">${groupedHtml}${otherHtml}</div>`;
        }

        function renderTabContent(tab) {
            const items = tabItems[tab] || tabItems.all;
            return tab === 'skill' ? renderSkillShopList(items) : renderItemList(items);
        }

        const html = `
            <div class="shop-tabs ranking-tabs">
                <button class="ui-btn ${activeTab === 'all' ? 'accent' : ''}" data-shop-tab="all">全部</button>
                <button class="ui-btn ${activeTab === 'skin' ? 'accent' : ''}" data-shop-tab="skin">皮肤</button>
                <button class="ui-btn ${activeTab === 'tool' ? 'accent' : ''}" data-shop-tab="tool">道具</button>
                <button class="ui-btn ${activeTab === 'skill' ? 'accent' : ''}" data-shop-tab="skill">技能</button>
            </div>
            <div id="shop-list" class="${activeTab === 'skill' ? 'shop-skill-list' : 'item-grid'}">${renderTabContent(activeTab)}</div>
        `;
        const root = openModal('校园商城', html);
        const list = root.querySelector('#shop-list');
        let currentTab = activeTab;

        function bindBuyButtons() {
            list.querySelectorAll('[data-buy-id]').forEach(btn => {
                btn.addEventListener('click', () => onBuy(btn.dataset.buyId, currentTab));
            });
        }

        bindBuyButtons();

        root.querySelectorAll('[data-shop-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTab = btn.dataset.shopTab;
                root.querySelectorAll('[data-shop-tab]').forEach(tab => tab.classList.toggle('accent', tab === btn));
                list.className = currentTab === 'skill' ? 'shop-skill-list' : 'item-grid';
                list.innerHTML = renderTabContent(currentTab);
                paintPixelIcons(list);
                bindBuyButtons();
            });
        });
    }

    function showPurchaseConfirm(item, onConfirm, onCancel) {
        const html = `
            <div class="purchase-confirm">
                ${itemImageHtml(item)}
                <div class="item-name">${item.name}</div>
                <p class="item-meta">确认购买该商品？</p>
                <p class="item-meta">价格：${item.price} NCUT 币</p>
            </div>
        `;
        const root = openModal('确认购买', html, `
            <button class="ui-btn" data-cancel-purchase>取消</button>
            <button class="ui-btn accent" data-confirm-purchase>确认购买</button>
        `);
        const cancel = () => {
            closeModal();
            onCancel?.();
        };
        root.querySelectorAll('[data-close-modal]').forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.replaceWith(clone);
            clone.addEventListener('click', cancel);
        });
        root.querySelector('[data-cancel-purchase]').addEventListener('click', cancel);
        root.querySelector('[data-confirm-purchase]').addEventListener('click', async () => {
            closeModal();
            await onConfirm?.();
        });
    }

    function showBag(inventory, onSell, profile, usage = 0, onRename) {
        const capacity = profile?.backpackCapacity || 50;
        const list = inventory.length
            ? `<div class="item-grid">${inventory.map(entry => {
                const item = entry.item;
                const meta = item.type === 'gem'
                    ? `价值：${item.value} NCUT 币`
                    : item.type === 'collectible'
                        ? `收藏值：${item.collectionValue}`
                        : item.type === 'skin'
                            ? `${item.rarity}｜收藏值 ${item.collectionValue}`
                            : item.type === 'rename_card'
                                ? (item.description || '可在背包中使用改名')
                                : (item.description || '可在摸金模式携带或使用');
                
                const canSell = ['gem', 'weapon', 'tool', 'speed', 'medkit'].includes(item.type);
                const actionBtn = canSell
                    ? `<button class="ui-btn accent" data-sell-id="${item.id}">出售</button>`
                    : item.type === 'rename_card'
                        ? `<button class="ui-btn accent" data-use-rename>使用改名</button>`
                        : `<button class="ui-btn" disabled>已拥有</button>`;
                return `
                    <div class="item-card">
                        ${itemImageHtml(item)}
                        <div class="item-name">${item.name} × ${entry.quantity}</div>
                        <div class="item-meta">${meta}</div>
                        ${actionBtn}
                    </div>
                `;
            }).join('')}</div>`
            : '<p class="item-meta">背包为空。</p>';
        const html = `<p class="item-meta">背包容量：${usage} / ${capacity}（皮肤、改名卡不占容量）</p>${list}`;
        const root = openModal('我的背包', html);
        root.querySelectorAll('[data-sell-id]').forEach(btn => {
            btn.addEventListener('click', () => onSell(btn.dataset.sellId));
        });
        root.querySelectorAll('[data-use-rename]').forEach(btn => {
            btn.addEventListener('click', () => onRename?.());
        });
    }

    function showSellQuantityDialog(item, maxQuantity, onConfirm, onCancel) {
        let sellPrice = 0;
        if (item.type === 'gem') {
            sellPrice = item.value;
        } else if (item.price) {
            sellPrice = Math.floor(item.price * 0.2);
        }
        
        const root = openModal('出售物品', `
            <div class="item-card">
                ${itemImageHtml(item)}
                <div class="item-name">${item.name}</div>
                <div class="item-meta">单价：${sellPrice} NCUT 币</div>
            </div>
            <div style="margin: 20px 0;">
                <label style="display: block; margin-bottom: 10px;">出售数量（最大 ${maxQuantity}）：</label>
                <input type="number" id="sell-quantity-input" min="1" max="${maxQuantity}" value="1" style="width: 100%; padding: 10px; font-size: 16px;">
                <div class="item-meta" style="margin-top: 10px;">预计获得：<span id="sell-total-price">${sellPrice}</span> NCUT 币</div>
            </div>
        `, `
            <button class="ui-btn accent" data-sell-confirm>确认出售</button>
            <button class="ui-btn" data-sell-cancel>取消</button>
        `);
        
        const quantityInput = root.querySelector('#sell-quantity-input');
        const totalPriceSpan = root.querySelector('#sell-total-price');
        
        quantityInput.addEventListener('input', () => {
            let quantity = parseInt(quantityInput.value) || 0;
            if (quantity < 1) quantity = 1;
            if (quantity > maxQuantity) quantity = maxQuantity;
            totalPriceSpan.textContent = sellPrice * quantity;
        });
        
        root.querySelector('[data-sell-confirm]').addEventListener('click', () => {
            const quantity = parseInt(quantityInput.value) || 0;
            if (quantity < 1 || quantity > maxQuantity) {
                toast('请输入有效的出售数量');
                return;
            }
            closeModal();
            onConfirm(quantity);
        });
        
        root.querySelector('[data-sell-cancel]').addEventListener('click', () => {
            closeModal();
            onCancel?.();
        });
    }

    function showRankings(rankings, onPlayerClick) {
        const formatTime = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
        const renderRows = (rows, type = 'normal') => rows.length
            ? rows.map((row, index) => {
                const isSurvival = type.startsWith('survival');
                const value = isSurvival ? `${formatTime(row.value)}｜击杀 ${row.kills}` : row.value;
                const clickable = row.userId && typeof onPlayerClick === 'function' && type !== 'survivalDuo' && type !== 'survivalSquad';
                const attrs = clickable
                    ? `class="ranking-card ranking-card-clickable" data-user-id="${escapeHtml(row.userId)}" role="button" tabindex="0"`
                    : 'class="ranking-card"';
                return `<div ${attrs}><strong>#${index + 1} ${escapeHtml(row.nickname || row.username || '玩家')}</strong><div class="item-meta">${value}</div></div>`;
            }).join('')
            : '<p class="item-meta">暂无排行数据。</p>';
        const html = `
            <div class="ranking-tabs">
                <button class="ui-btn accent" data-rank-tab="coins">NCUT 币排行</button>
                <button class="ui-btn" data-rank-tab="skins">收藏值排行</button>
                <button class="ui-btn" data-rank-tab="survivalSolo">生存·单人</button>
                <button class="ui-btn" data-rank-tab="survivalDuo">生存·双人</button>
                <button class="ui-btn" data-rank-tab="survivalSquad">生存·四人</button>
            </div>
            <div id="ranking-list" class="ranking-grid">${renderRows(rankings.coins)}</div>
            <p class="item-meta ranking-tip">单人榜可点击昵称查看简介；双人/四人榜展示完整队伍。</p>
        `;
        const root = openModal('排行榜', html);
        const list = root.querySelector('#ranking-list');
        let activeTab = 'coins';

        function bindRowClicks(container) {
            if (typeof onPlayerClick !== 'function') return;
            container.querySelectorAll('[data-user-id]').forEach(row => {
                const openProfile = () => onPlayerClick(row.dataset.userId);
                row.addEventListener('click', openProfile);
                row.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProfile();
                    }
                });
            });
        }

        bindRowClicks(list);
        root.querySelectorAll('[data-rank-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.rankTab;
                root.querySelectorAll('[data-rank-tab]').forEach(tab => tab.classList.toggle('accent', tab === btn));
                list.innerHTML = renderRows(rankings[activeTab], activeTab);
                bindRowClicks(list);
            });
        });
    }

    function showPlayerProfile(profile, relation, handlers = {}, options = {}) {
        const { onAddFriend, onAcceptRequest, onRejectRequest, onOpenChat } = handlers;
        let actionHtml = '';
        if (relation?.status === 'none' && onAddFriend) {
            actionHtml = '<button type="button" class="ui-btn accent" data-profile-add-friend>加好友</button>';
        } else if (relation?.status === 'pending_sent') {
            actionHtml = '<button type="button" class="ui-btn" disabled>已发送申请</button>';
        } else if (relation?.status === 'pending_received' && onAcceptRequest && onRejectRequest) {
            actionHtml = `
                <button type="button" class="ui-btn accent" data-profile-accept>接受好友</button>
                <button type="button" class="ui-btn" data-profile-reject>拒绝</button>
            `;
        } else if (relation?.status === 'friend' && onOpenChat) {
            actionHtml = '<button type="button" class="ui-btn accent" data-profile-chat>发消息</button>';
        }

        const bodyHtml = `
            <div class="player-profile-card">
                <div class="player-profile-header">
                    <strong>${escapeHtml(profile.nickname)}</strong>
                    <span class="online-badge ${profile.online ? 'online' : ''}">${profile.online ? '在线' : '离线'}</span>
                </div>
                <p class="player-profile-bio">${escapeHtml(profile.bio || '这位同学还没有填写简介。')}</p>
            </div>
        `;

        let root;
        if (options.mountIn) {
            const overlay = document.createElement('div');
            overlay.className = 'profile-overlay';
            overlay.innerHTML = `
                <div class="profile-overlay-panel">
                    <div class="modal-header">
                        <h3>玩家简介</h3>
                        <button type="button" class="ui-btn" data-profile-close>关闭</button>
                    </div>
                    ${bodyHtml}
                    ${actionHtml ? `<div class="modal-actions">${actionHtml}</div>` : ''}
                </div>
            `;
            options.mountIn.appendChild(overlay);
            root = overlay;
            root.querySelector('[data-profile-close]').addEventListener('click', () => overlay.remove());
        } else {
            root = openModal('玩家简介', bodyHtml, actionHtml);
            root.querySelector('.modal-panel')?.classList.add('player-profile-modal');
        }

        const closeProfile = () => {
            if (options.mountIn) {
                root.remove();
            } else {
                closeModal();
            }
        };

        root.querySelector('[data-profile-add-friend]')?.addEventListener('click', async () => {
            await onAddFriend?.(profile);
            if (options.mountIn) root.remove();
        });
        root.querySelector('[data-profile-accept]')?.addEventListener('click', async () => {
            await onAcceptRequest?.(relation.requestId, profile);
            if (options.mountIn) root.remove();
        });
        root.querySelector('[data-profile-reject]')?.addEventListener('click', async () => {
            await onRejectRequest?.(relation.requestId, profile);
            if (options.mountIn) root.remove();
        });
        root.querySelector('[data-profile-chat]')?.addEventListener('click', () => {
            closeProfile();
            onOpenChat?.(profile);
        });
        return root;
    }

    function formatChatTime(iso) {
        if (!iso) return '';
        const date = new Date(iso);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    function renderFriendListItem(friend, selectedFriendId) {
        return `
            <button type="button" class="friend-list-item ${friend.id === selectedFriendId ? 'active' : ''}" data-friend-id="${escapeHtml(friend.id)}">
                <span class="friend-list-name">${escapeHtml(friend.nickname)}</span>
                <span class="online-badge ${friend.online ? 'online' : ''}">${friend.online ? '在线' : '离线'}</span>
            </button>
        `;
    }

    function renderChatMessages(messages) {
        if (!messages.length) return '<div class="chat-empty">还没有消息，打个招呼吧。</div>';
        return messages.map(message => `
            <div class="chat-message ${message.mine ? 'mine' : 'theirs'}">
                <div class="chat-bubble">${escapeHtml(message.content)}</div>
                <div class="chat-time">${formatChatTime(message.createdAt)}</div>
            </div>
        `).join('');
    }

    function showFriendsChat(controller) {
        const html = `
            <div class="chat-layout">
                <aside class="chat-sidebar">
                    <div class="chat-search-box">
                        <input type="text" id="friend-search-input" class="chat-search-input" maxlength="20" placeholder="搜索昵称添加好友">
                        <button type="button" class="ui-btn" id="friend-search-btn">搜索</button>
                    </div>
                    <div id="friend-search-results" class="friend-search-results"></div>
                    <div class="chat-section-title">好友申请</div>
                    <div id="friend-request-list" class="friend-request-list"></div>
                    <div class="chat-section-title">好友列表</div>
                    <div id="friend-list" class="friend-list"></div>
                </aside>
                <main class="chat-main">
                    <div id="chat-main-header" class="chat-main-header">选择好友开始聊天</div>
                    <div id="chat-message-list" class="chat-message-list"></div>
                    <form id="chat-send-form" class="chat-send-form hidden">
                        <input type="text" id="chat-message-input" class="chat-message-input" maxlength="500" placeholder="输入消息，Enter 发送">
                        <button type="submit" class="ui-btn accent">发送</button>
                    </form>
                </main>
            </div>
        `;
        const root = openModal('好友与聊天', html);
        const panel = root.querySelector('.modal-panel');
        panel?.classList.add('friends-chat-modal');

        const searchInput = root.querySelector('#friend-search-input');
        const searchResultsEl = root.querySelector('#friend-search-results');
        const requestListEl = root.querySelector('#friend-request-list');
        const friendListEl = root.querySelector('#friend-list');
        const chatHeaderEl = root.querySelector('#chat-main-header');
        const messageListEl = root.querySelector('#chat-message-list');
        const sendForm = root.querySelector('#chat-send-form');
        const messageInput = root.querySelector('#chat-message-input');

        let selectedFriendId = controller.initialFriendId || null;
        let pollTimer = null;
        let refreshing = false;

        async function refresh() {
            if (refreshing) return;
            refreshing = true;
            try {
                const state = await controller.getState(selectedFriendId);
                selectedFriendId = state.selectedFriendId || selectedFriendId;

                if (state.searchResults?.length) {
                    searchResultsEl.innerHTML = state.searchResults.map(user => `
                        <div class="friend-search-item">
                            <button type="button" class="friend-search-name" data-view-user="${escapeHtml(user.id)}">${escapeHtml(user.nickname)}</button>
                            <button type="button" class="ui-btn" data-add-friend="${escapeHtml(user.id)}">加好友</button>
                        </div>
                    `).join('');
                } else if (searchInput.value.trim()) {
                    searchResultsEl.innerHTML = '<p class="item-meta">未找到匹配玩家。</p>';
                } else {
                    searchResultsEl.innerHTML = '';
                }

                requestListEl.innerHTML = state.requests?.length
                    ? state.requests.map(req => `
                        <div class="friend-request-item">
                            <button type="button" class="friend-search-name" data-view-user="${escapeHtml(req.fromUser.id)}">${escapeHtml(req.fromUser.nickname)}</button>
                            <div class="friend-request-actions">
                                <button type="button" class="ui-btn accent" data-accept-request="${escapeHtml(req.id)}">接受</button>
                                <button type="button" class="ui-btn" data-reject-request="${escapeHtml(req.id)}">拒绝</button>
                            </div>
                        </div>
                    `).join('')
                    : '<p class="item-meta">暂无好友申请。</p>';

                friendListEl.innerHTML = state.friends?.length
                    ? state.friends.map(friend => renderFriendListItem(friend, selectedFriendId)).join('')
                    : '<p class="item-meta">还没有好友，试试搜索昵称吧。</p>';

                const selectedFriend = state.friends?.find(friend => friend.id === selectedFriendId) || null;
                if (selectedFriend) {
                    chatHeaderEl.innerHTML = `
                        <button type="button" class="chat-header-name" data-view-user="${escapeHtml(selectedFriend.id)}">${escapeHtml(selectedFriend.nickname)}</button>
                        <span class="online-badge ${selectedFriend.online ? 'online' : ''}">${selectedFriend.online ? '在线' : '离线'}</span>
                    `;
                    messageListEl.innerHTML = renderChatMessages(state.messages || []);
                    sendForm.classList.remove('hidden');
                    messageListEl.scrollTop = messageListEl.scrollHeight;
                } else {
                    chatHeaderEl.textContent = '选择好友开始聊天';
                    messageListEl.innerHTML = '<div class="chat-empty">从左侧选择一位好友。</div>';
                    sendForm.classList.add('hidden');
                }
            } finally {
                refreshing = false;
            }
        }

        function cleanup() {
            clearInterval(pollTimer);
            controller.onClose?.();
        }

        root.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', cleanup);
        });

        root.querySelector('#friend-search-btn').addEventListener('click', async () => {
            await controller.onSearch?.(searchInput.value.trim());
            await refresh();
        });
        searchInput.addEventListener('keydown', async event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                await controller.onSearch?.(searchInput.value.trim());
                await refresh();
            }
        });

        friendListEl.addEventListener('click', async event => {
            const item = event.target.closest('[data-friend-id]');
            if (!item) return;
            selectedFriendId = item.dataset.friendId;
            await controller.onSelectFriend?.(selectedFriendId);
            await refresh();
        });

        root.addEventListener('click', async event => {
            const addBtn = event.target.closest('[data-add-friend]');
            if (addBtn) {
                await controller.onSendRequest?.(addBtn.dataset.addFriend);
                await refresh();
                return;
            }
            const acceptBtn = event.target.closest('[data-accept-request]');
            if (acceptBtn) {
                await controller.onAcceptRequest?.(acceptBtn.dataset.acceptRequest);
                await refresh();
                return;
            }
            const rejectBtn = event.target.closest('[data-reject-request]');
            if (rejectBtn) {
                await controller.onRejectRequest?.(rejectBtn.dataset.rejectRequest);
                await refresh();
                return;
            }
            const viewBtn = event.target.closest('[data-view-user]');
            if (viewBtn) {
                await controller.onViewProfile?.(viewBtn.dataset.viewUser);
            }
        });

        sendForm.addEventListener('submit', async event => {
            event.preventDefault();
            const content = messageInput.value.trim();
            if (!content || !selectedFriendId) return;
            await controller.onSendMessage?.(selectedFriendId, content);
            messageInput.value = '';
            await refresh();
        });

        refresh();
        pollTimer = setInterval(refresh, 4000);
        return { refresh, cleanup, root };
    }

    function showSurvivalResult(result, onRetry, onLobby) {
        const formatTime = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
        const root = openModal('生存模式结算', `
            <div class="ranking-card">
                <strong>本局生存时间：${formatTime(result.seconds)}</strong>
                <div class="item-meta">击杀数：${result.kills}<br>结束原因：${result.reason}</div>
            </div>
        `, `
            <button class="ui-btn accent" data-survival-retry>再来一局</button>
            <button class="ui-btn" data-survival-lobby>返回大厅</button>
        `);
        root.querySelector('[data-survival-retry]').addEventListener('click', () => {
            closeModal();
            onRetry();
        });
        root.querySelector('[data-survival-lobby]').addEventListener('click', () => {
            closeModal();
            onLobby();
        });
    }

    function showCollections(inventory) {
        const ownedQuantityById = Object.fromEntries(inventory.map(entry => [entry.itemId, entry.quantity]));
        const sorted = [...assets.collectibles].sort((a, b) => Number(!ownedQuantityById[a.id]) - Number(!ownedQuantityById[b.id]));
        const html = `
            <p class="item-meta collection-hint">收藏品需参与摸金模式获得，但很稀有</p>
            <div class="item-grid">${sorted.map(item => {
            const quantity = ownedQuantityById[item.id] || 0;
            const unlocked = quantity > 0;
            return `
                <div class="item-card ${unlocked ? '' : 'locked'}">
                    ${itemImageHtml(item)}
                    <div class="item-name">${item.name}${unlocked ? ` × ${quantity}` : ''}</div>
                    <div class="item-meta">收藏值：${item.collectionValue}<br>${unlocked ? '已解锁' : '未解锁'}</div>
                </div>
            `;
        }).join('')}</div>`;
        openModal('收藏品', html);
    }

    function showDailyTasks(tasks, onClaim) {
        const html = `<div class="item-grid">${tasks.map(task => {
            const btnClass = task.claimed ? 'ui-btn claimed' : task.completed ? 'ui-btn accent' : 'ui-btn';
            const btnText = task.claimed ? '已领取' : '领取';
            const btnDisabled = task.claimed || !task.completed;
            const progressText = task.target
                ? `进度：${Math.min(task.progress || 0, task.target)}/${task.target}`
                : '';
            return `
                <div class="item-card ${task.completed ? '' : 'locked'}">
                    <div class="item-name">${task.name}</div>
                    <div class="item-meta">奖励：${task.reward} NCUT 币${progressText ? `<br>${progressText}` : ''}</div>
                    <button class="${btnClass}" data-claim-task="${task.id}" ${btnDisabled ? 'disabled' : ''}>${btnText}</button>
                </div>
            `;
        }).join('')}</div><p class="item-meta">每日任务按中国北京时间 0 点重置。</p>`;
        const root = openModal('每日任务', html);
        root.querySelectorAll('[data-claim-task]').forEach(btn => {
            btn.addEventListener('click', () => onClaim(btn.dataset.claimTask));
        });
    }

    function showBioEditor(currentBio, onSave, onCancel) {
        const modalRoot = document.getElementById('modal-root');
        if (!modalRoot) {
            toast('弹窗容器缺失，请刷新页面');
            return;
        }

        const html = `
            <div class="bio-editor-box">
                <textarea id="bio-input" class="bio-input" maxlength="100" placeholder="写下你的校园冒险故事，最多 100 字"></textarea>
            </div>
            <p class="item-meta bio-editor-count"><span id="bio-count">0</span>/100</p>
        `;
        const root = openModal('编辑简介', html, `
            <button type="button" class="ui-btn" id="bio-cancel">取消</button>
            <button type="button" class="ui-btn accent" id="bio-save">保存</button>
        `);
        root.querySelector('.modal-panel')?.classList.add('bio-editor-modal');

        const input = root.querySelector('#bio-input');
        const counter = root.querySelector('#bio-count');
        const cancelBtn = root.querySelector('#bio-cancel');
        const saveBtn = root.querySelector('#bio-save');
        if (!input || !counter || !cancelBtn || !saveBtn) {
            toast('简介编辑器加载失败');
            closeModal();
            return;
        }

        input.value = currentBio || '';
        counter.textContent = String(input.value.length);
        input.addEventListener('input', () => {
            counter.textContent = String(input.value.length);
        });

        const closeEditor = () => {
            closeModal();
            onCancel?.();
        };

        cancelBtn.addEventListener('click', closeEditor);
        root.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', closeEditor);
        });

        saveBtn.addEventListener('click', () => {
            onSave?.(input.value.trim());
        });

        modalRoot.classList.remove('hidden');
        modalRoot.style.display = 'flex';
        input.focus();
    }

    function showRenameDialog(currentNickname, onConfirm) {
        const html = `
            <p class="item-meta">消耗 1 张改名卡，修改后将在游戏内展示新昵称。</p>
            <input type="text" id="rename-input" class="rename-input" maxlength="12" value="${currentNickname}" placeholder="请输入新昵称（2-12字）">
        `;
        const root = openModal('修改昵称', html, '<button class="ui-btn accent" id="rename-confirm">确认改名</button>');
        const input = root.querySelector('#rename-input');
        root.querySelector('#rename-confirm').addEventListener('click', () => onConfirm(input.value.trim()));
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') onConfirm(input.value.trim());
        });
        input.focus();
        input.select();
    }

    function showAchievements(achievements) {
        const sorted = [...achievements].sort((a, b) => Number(!a.unlocked) - Number(!b.unlocked));
        const html = `<div class="item-grid">${sorted.map(item => `
            <div class="item-card ${item.unlocked ? '' : 'locked'}">
                <div class="item-name">${item.name}</div>
                <div class="item-meta">${item.description}<br>${item.unlocked ? '已解锁' : '未解锁'}${item.progress ? `<br>进度：${item.progress}` : ''}</div>
            </div>
        `).join('')}</div>`;
        openModal('成就系统', html);
    }

    function showSurvivalPrep(activeSkills, passiveSkills, onStart) {
        let selectedActive = activeSkills[0]?.id || '';
        let selectedPassive = passiveSkills[0]?.id || '';
        let selectedMode = 'solo';

        function renderSkillButton(skill, group) {
            const selected = group === 'active' ? skill.id === selectedActive : skill.id === selectedPassive;
            const tag = skill.price > 0 ? '付费' : '免费';
            return `
                <button type="button" class="skill-prep-card ${selected ? 'selected' : ''}" data-skill-group="${group}" data-skill-id="${skill.id}">
                    ${itemImageHtml(skill)}
                    <div class="item-name">${skill.name}</div>
                    <div class="item-meta">${tag}｜${skill.description || ''}</div>
                </button>
            `;
        }

        const html = `
            <p class="item-meta">选择模式与技能。双人/四人需匹配队友，怪物共享且进化更快、数量更多。</p>
            <div class="skill-prep-section">
                <div class="chat-section-title">游戏模式</div>
                <div class="skill-prep-grid survival-mode-grid">
                    <button type="button" class="skill-prep-card selected" data-survival-mode="solo">
                        <div class="item-name">单人</div>
                        <div class="item-meta">20 秒进化｜10~30 怪</div>
                    </button>
                    <button type="button" class="skill-prep-card" data-survival-mode="duo">
                        <div class="item-name">双人</div>
                        <div class="item-meta">18 秒进化｜14~40 怪｜匹配 2 人</div>
                    </button>
                    <button type="button" class="skill-prep-card" data-survival-mode="squad">
                        <div class="item-name">四人</div>
                        <div class="item-meta">15 秒进化｜18~50 怪｜匹配 4 人</div>
                    </button>
                </div>
            </div>
            <div class="skill-prep-section">
                <div class="chat-section-title">主动技能</div>
                <div class="skill-prep-grid">${activeSkills.map(skill => renderSkillButton(skill, 'active')).join('')}</div>
            </div>
            <div class="skill-prep-section">
                <div class="chat-section-title">被动技能</div>
                <div class="skill-prep-grid">${passiveSkills.map(skill => renderSkillButton(skill, 'passive')).join('')}</div>
            </div>
        `;
        const root = openModal('生存模式准备', html, `
            <button type="button" class="ui-btn accent" id="survival-start-btn">开始生存</button>
        `);
        root.querySelector('.modal-panel')?.classList.add('survival-prep-modal');

        function refreshSelection() {
            root.querySelectorAll('[data-skill-id]').forEach(btn => {
                const selected = btn.dataset.skillGroup === 'active'
                    ? btn.dataset.skillId === selectedActive
                    : btn.dataset.skillId === selectedPassive;
                btn.classList.toggle('selected', selected);
            });
            root.querySelectorAll('[data-survival-mode]').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.survivalMode === selectedMode);
            });
        }

        root.querySelectorAll('[data-skill-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.skillGroup === 'active') selectedActive = btn.dataset.skillId;
                else selectedPassive = btn.dataset.skillId;
                refreshSelection();
            });
        });

        root.querySelectorAll('[data-survival-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedMode = btn.dataset.survivalMode;
                refreshSelection();
            });
        });

        root.querySelector('#survival-start-btn').addEventListener('click', () => {
            if (!selectedActive || !selectedPassive) {
                toast('请选择主动和被动技能');
                return;
            }
            closeModal();
            onStart(selectedActive, selectedPassive, selectedMode);
        });
    }

    function showSurvivalWaiting({ modeLabel, teamSize, members = [], onCancel, onReady }) {
        let cancelHandler = null;
        const renderMembers = list => list.length
            ? list.map(member => `<div class="ranking-card"><strong>${escapeHtml(member.nickname || '玩家')}</strong></div>`).join('')
            : '<p class="item-meta">等待第一位玩家...</p>';
        const html = `
            <p class="item-meta">${modeLabel}匹配中，需要 ${teamSize} 人组队。人满后自动开始。</p>
            <div class="ranking-grid" id="survival-wait-members">${renderMembers(members)}</div>
            <p class="item-meta">当前 ${members.length}/${teamSize} 人</p>
        `;
        const root = openModal('等待队友', html, `
            <button type="button" class="ui-btn" id="survival-wait-cancel">取消匹配</button>
        `);
        root.querySelector('.modal-panel')?.classList.add('survival-prep-modal');

        root.querySelector('#survival-wait-cancel')?.addEventListener('click', () => {
            closeModal();
            cancelHandler?.();
            onCancel?.();
        });

        return {
            updateMembers(list) {
                const box = root.querySelector('#survival-wait-members');
                const meta = root.querySelector('.item-meta:last-of-type');
                if (box) box.innerHTML = renderMembers(list);
                if (meta) meta.textContent = `当前 ${list.length}/${teamSize} 人`;
            },
            cancel(onCancelFn) {
                cancelHandler = onCancelFn;
            },
            close() {
                closeModal();
            },
        };
    }

    function showGoldRushPrep(inventory, activeSkills, passiveSkills, onStart) {
        let selectedActive = activeSkills[0]?.id || '';
        let selectedPassive = passiveSkills[0]?.id || '';
        let selectedWeapon = '';
        let selectedSpeed = '';
        const carryableWeapons = inventory.filter(entry => ['weapon', 'tool'].includes(entry.item.type));
        const carryableSpeed = inventory.filter(entry => entry.item.type === 'speed');

        function renderSkillButton(skill, group) {
            const selected = group === 'active' ? skill.id === selectedActive : skill.id === selectedPassive;
            const tag = skill.price > 0 ? '付费' : '免费';
            return `
                <button type="button" class="skill-prep-card ${selected ? 'selected' : ''}" data-skill-group="${group}" data-skill-id="${skill.id}">
                    ${itemImageHtml(skill)}
                    <div class="item-name">${skill.name}</div>
                    <div class="item-meta">${tag}｜${skill.description || ''}</div>
                </button>
            `;
        }

        function renderCarryCard(entry, group) {
            const selected = group === 'weapon' ? entry.itemId === selectedWeapon : entry.itemId === selectedSpeed;
            const durabilityText = entry.item.type === 'speed'
                ? `移速耐久 ${entry.item.moveDurability || 0}`
                : `攻击耐久 ${entry.item.durability || 0}`;
            return `
                <button type="button" class="item-card skill-prep-card ${selected ? 'selected' : ''}" data-carry-group="${group}" data-carry-id="${entry.itemId}">
                    ${itemImageHtml(entry.item)}
                    <div class="item-name">${entry.item.name}</div>
                    <div class="item-meta">${entry.item.description || ''}<br>${durabilityText}｜数量：${entry.quantity}</div>
                </button>
            `;
        }

        const html = `
            <p class="item-meta">开局前各选一个主动技能与一个被动技能。可携带 <strong>1</strong> 件武器/工具与 <strong>1</strong> 件移速装备（均有耐久，当局消耗）。空手进入时，拾取的装备可当场装备使用。主动技能按 <strong>I</strong> 释放。</p>
            <div class="skill-prep-section">
                <div class="chat-section-title">主动技能</div>
                <div class="skill-prep-grid">${activeSkills.map(skill => renderSkillButton(skill, 'active')).join('')}</div>
            </div>
            <div class="skill-prep-section">
                <div class="chat-section-title">被动技能</div>
                <div class="skill-prep-grid">${passiveSkills.map(skill => renderSkillButton(skill, 'passive')).join('')}</div>
            </div>
            <div class="skill-prep-section">
                <div class="chat-section-title">携带武器/工具（可选 1 件）</div>
                ${carryableWeapons.length
                    ? `<div class="item-grid">${carryableWeapons.map(entry => renderCarryCard(entry, 'weapon')).join('')}</div>`
                    : '<p class="item-meta">背包没有可携带武器，可空手进入或先去商城购买。</p>'}
            </div>
            <div class="skill-prep-section">
                <div class="chat-section-title">携带移速装备（可选 1 件）</div>
                ${carryableSpeed.length
                    ? `<div class="item-grid">${carryableSpeed.map(entry => renderCarryCard(entry, 'speed')).join('')}</div>`
                    : '<p class="item-meta">背包没有疾行鞋/护符，可当局拾取装备使用。</p>'}
            </div>
        `;
        const root = openModal('摸金准备', html, `
            <button type="button" class="ui-btn accent" id="goldrush-start-btn">进入摸金模式</button>
        `);
        root.querySelector('.modal-panel')?.classList.add('survival-prep-modal');

        function refreshSelection() {
            root.querySelectorAll('[data-skill-id]').forEach(btn => {
                const selected = btn.dataset.skillGroup === 'active'
                    ? btn.dataset.skillId === selectedActive
                    : btn.dataset.skillId === selectedPassive;
                btn.classList.toggle('selected', selected);
            });
            root.querySelectorAll('[data-carry-id]').forEach(btn => {
                const selected = btn.dataset.carryGroup === 'weapon'
                    ? btn.dataset.carryId === selectedWeapon
                    : btn.dataset.carryId === selectedSpeed;
                btn.classList.toggle('selected', selected);
            });
        }

        root.querySelectorAll('[data-skill-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.skillGroup === 'active') selectedActive = btn.dataset.skillId;
                else selectedPassive = btn.dataset.skillId;
                refreshSelection();
            });
        });

        root.querySelectorAll('[data-carry-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.carryGroup === 'weapon') {
                    selectedWeapon = selectedWeapon === btn.dataset.carryId ? '' : btn.dataset.carryId;
                } else {
                    selectedSpeed = selectedSpeed === btn.dataset.carryId ? '' : btn.dataset.carryId;
                }
                refreshSelection();
            });
        });

        root.querySelector('#goldrush-start-btn').addEventListener('click', () => {
            if (!selectedActive || !selectedPassive) {
                toast('请选择主动和被动技能');
                return;
            }
            closeModal();
            const carriedItems = [selectedWeapon, selectedSpeed].filter(Boolean);
            onStart(selectedActive, selectedPassive, carriedItems);
        });
    }

    function showGameplayGuide() {
        const html = `
            <div class="gameplay-guide-body">
                <div class="gameplay-guide-card">
                    <h4>参观校园</h4>
                    <p>自由探索 NCUT 校园地图，查看建筑信息，与其他在线玩家同屏漫游。</p>
                    <ul>
                        <li>PC：WASD 或方向键移动，鼠标拖曳查看地图</li>
                        <li>手机：左下角摇杆移动，建议横屏游玩</li>
                    </ul>
                </div>
                <div class="gameplay-guide-card">
                    <h4>摸金模式</h4>
                    <p>在校园中搜刮宝石与物资，击败怪物，找到撤离点（北门或南门）并成功撤离即可带出收益。</p>
                    <ul>
                        <li>本局死亡或未撤离，背包物品会丢失</li>
                        <li>PC：K 攻击、L 拾取、I 技能、J 撤离</li>
                        <li>手机：右下攻击，左侧拾取与技能，摸金另有撤离按钮</li>
                    </ul>
                </div>
                <div class="gameplay-guide-card">
                    <h4>生存模式</h4>
                    <p>抵御不断进化、数量递增的怪物浪潮，支持单人、双人与四人组队。</p>
                    <ul>
                        <li>坚持越久排名越高，组队模式共享怪物与击杀</li>
                        <li>先阵亡者可观战，全队阵亡后统一结算</li>
                        <li>操作方式与摸金模式相同</li>
                    </ul>
                </div>
            </div>
        `;
        const root = openModal('玩法说明', html);
        root.querySelector('.modal-panel')?.classList.add('gameplay-guide-modal');
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        ui: {
            ...(global.NCUTMap.ui || {}),
            toast,
            closeModal,
            openModal,
            renderLobby,
            showRoleSelector,
            showShop,
            showPurchaseConfirm,
            showBag,
            showSellQuantityDialog,
            showRankings,
            showPlayerProfile,
            showFriendsChat,
            showCollections,
            showDailyTasks,
            showRenameDialog,
            showBioEditor,
            showAchievements,
            showSurvivalResult,
            showGoldRushPrep,
            showSurvivalPrep,
            showSurvivalWaiting,
            showGameplayGuide,
            paintPixelIcons,
        },
    };
})(window);
