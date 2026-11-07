/**
 * 云列表同步扩展（Cloud List Sync）
 * 让两个（或多个）TurboWarp 作品共享同一套"云列表"。
 * 作品1 更新云列表 -> 通过共享 WebSocket 中继服务器 -> 作品2 的云列表跟着更新。
 *
 * ⚠️ 本扩展必须运行在 Unsandboxed（非沙盒）模式，因为它需要 WebSocket 与运行时 API。
 *    在 TurboWarp 编辑器 → 添加扩展 → 自定义扩展 → 文件/文本 加载本脚本即可。
 *
 * 使用流程：
 *   1. 两端作品都加载本扩展，用同一个「房间名」连接同一个 WebSocket 服务器。
 *   2. 作品1 用「设置云列表 [...] 的第 [n] 项为 [...]」等积木改列表，改动会自动广播。
 *   3. 作品2 收到后本地列表同步更新，并触发「当云列表 [...] 收到更新」帽块。
 */
(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('云列表同步扩展必须在非沙盒（Unsandboxed）模式下运行');
    }

    var WS_URL_DEFAULT = 'ws://localhost:8080/'; // 改成你自己的中继服务器地址
    var ROOM_DEFAULT = 'default-room';
    var SEND_DEBOUNCE_MS = 30; // 批量合并发送的间隔，降低高频改动的压力

    // ────────────────────────────────────────────────────────────
    // 工具函数
    // ────────────────────────────────────────────────────────────

    // 把任意值转成"列表元素"字符串（Scratch 列表元素都是字符串）
    function asString(v) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'number' && !isFinite(v)) return '';
        return String(v);
    }

    // 把任意值转成合法的下标（1-based，与 Scratch 列表一致）
    function asIndex(v, listLen) {
        var n = Math.floor(Scratch.Cast.toNumber(v));
        if (!isFinite(n)) n = 1;
        if (n < 1) n = 1;
        if (n > listLen) n = listLen;
        if (listLen < 1) n = 1;
        return n;
    }

    // 生成一个短随机客户端 id，用于标识发送方、避免回环
    function makeClientId() {
        return 'c-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
    }

    // ────────────────────────────────────────────────────────────
    // 核心扩展类
    // ────────────────────────────────────────────────────────────
    function CloudListSync() {
        this._clientId = makeClientId();
        this._wsUrl = WS_URL_DEFAULT;
        this._room = ROOM_DEFAULT;
        this._password = '';

        // 本扩展管理的多个云列表：{ name -> [item, item, ...] }
        this._lists = Object.create(null);

        // 每个列表的"最后更新来源"，防止自己广播的消息又被自己接收造成回环
        // 这里改用 clientId + seq 判断，见 _applyRemote。

        // WebSocket 状态
        this._ws = null;
        this._manualClose = false;
        this._outbox = []; // 未连上时排队
        this._connected = false;

        // 批量发送缓冲
        this._pending = Object.create(null);
        this._flushTimer = null;

        // 事件帽块触发的"待上报"列表名队列（按接收顺序）
        this._updatedQueue = [];

        // 最近一次收到的原始负载，供帽块脚本内查询
        this._lastList = '';
        this._lastIndex = 0;
        this._lastValue = '';
        this._lastType = ''; // 'set' | 'insert' | 'delete' | 'replaceAll' | 'length'
    }

    CloudListSync.prototype = {
        constructor: CloudListSync,

        // ── 获取运行时，访问本作品的列表变量 ──
        _getRuntime: function () {
            try {
                return Scratch.vm && Scratch.vm.runtime;
            } catch (e) {
                return null;
            }
        },

        // 找到舞台上对应名字的列表变量对象 {value: [items]}
        _findListVar: function (name) {
            var rt = this._getRuntime();
            if (!rt) return null;
            var targets = rt.targets || [];
            for (var i = 0; i < targets.length; i++) {
                var t = targets[i];
                var vars = (t && t.variables) || Object.create(null);
                for (var id in vars) {
                    if (!Object.prototype.hasOwnProperty.call(vars, id)) continue;
                    var v = vars[id];
                    // v: [name, value, isCloud?, isList?]  —— 列表第 3 项往往是 'list'
                    if (v && v[0] === name && Array.isArray(v[1])) {
                        return v;
                    }
                }
            }
            return null;
        },

        // 读取某个云列表的当前值（优先用运行时里的，没有就退回内部缓存）
        _readList: function (name) {
            var v = this._findListVar(name);
            if (v) return v[1];
            if (!this._lists[name]) this._lists[name] = [];
            return this._lists[name];
        },

        // 写入某个云列表（同步到运行时 + 内部缓存）
        _writeList: function (name, arr) {
            var v = this._findListVar(name);
            if (v) {
                v[1] = arr;
            }
            this._lists[name] = arr;
        },

        // 保证列表存在
        _ensureList: function (name) {
            var v = this._findListVar(name);
            if (v) {
                this._lists[name] = v[1];
            } else if (!this._lists[name]) {
                this._lists[name] = [];
            }
            return this._lists[name];
        },

        // ── WebSocket 连接管理 ──
        _connect: function () {
            var self = this;
            if (this._ws && (this._ws.readyState === 0 || this._ws.readyState === 1)) {
                return; // 正在连或已连
            }
            var url = this._wsUrl;
            if (!/^wss?:\/\//i.test(url)) {
                url = 'ws://' + url;
            }
            this._manualClose = false;
            try {
                this._ws = new WebSocket(url);
            } catch (e) {
                this._connected = false;
                return;
            }

            this._ws.onopen = function () {
                self._connected = true;
                // 加入指定房间
                self._sendRaw({
                    t: 'join',
                    room: self._room,
                    password: self._password,
                    clientId: self._clientId
                });
                // 把队列里没发完的补发
                while (self._outbox.length) {
                    self._ws.send(self._outbox.shift());
                }
            };

            this._ws.onmessage = function (ev) {
                var msg;
                try {
                    msg = JSON.parse(ev.data);
                } catch (e) {
                    return;
                }
                self._handleServerMessage(msg);
            };

            this._ws.onclose = function () {
                self._connected = false;
                self._ws = null;
                // 自动重连（非手动关闭时）
                if (!self._manualClose) {
                    setTimeout(function () { self._connect(); }, 3000);
                }
            };

            this._ws.onerror = function () {
                try { self._ws.close(); } catch (e) {}
            };
        },

        _disconnect: function () {
            this._manualClose = true;
            if (this._ws) {
                try { this._ws.close(); } catch (e) {}
            }
            this._ws = null;
            this._connected = false;
        },

        // 发送一条消息（连上了直接发，否则进队列）
        _sendRaw: function (obj) {
            var data = JSON.stringify(obj);
            if (this._connected && this._ws && this._ws.readyState === 1) {
                this._ws.send(data);
            } else {
                this._outbox.push(data);
            }
        },

        // 把一次本地改动排入批量发送缓冲
        _queueChange: function (type, name, extra) {
            extra = extra || {};
            this._pending[name] = {
                t: 'listChange',
                room: this._room,
                password: this._password,
                clientId: this._clientId,
                type: type,
                name: name,
                seq: Date.now() + Math.random(),
                index: 'index' in extra ? extra.index : undefined,
                value: 'value' in extra ? extra.value : undefined,
                items: 'items' in extra ? extra.items : undefined,
                length: 'length' in extra ? extra.length : undefined
            };
            this._scheduleFlush();
        },

        _scheduleFlush: function () {
            if (this._flushTimer) return;
            var self = this;
            this._flushTimer = setTimeout(function () {
                self._flushTimer = null;
                var names = Object.keys(self._pending);
                for (var i = 0; i < names.length; i++) {
                    self._sendRaw(self._pending[names[i]]);
                }
                self._pending = Object.create(null);
            }, SEND_DEBOUNCE_MS);
        },

        // ── 处理来自服务器的消息 ──
        _handleServerMessage: function (msg) {
            if (!msg || !msg.t) return;

            // 服务器会把房间里的改动广播回来，用 clientId 过滤掉自己发的
            if (msg.t === 'listChange') {
                if (msg.clientId === this._clientId) return; // 忽略自己的回环
                if (msg.room !== this._room) return;
                this._applyRemote(msg);
            } else if (msg.t === 'joined') {
                // 服务器确认加入成功，可在此扩展：请求全量同步快照
                // 这里约定：加入后由客户端主动发一次 snapshot 请求
                this._sendRaw({ t: 'requestSnapshot', room: this._room, password: this._password });
            } else if (msg.t === 'snapshot') {
                // 收到服务器发来的全量列表快照
                var snap = (msg.lists && typeof msg.lists === 'object') ? msg.lists : {};
                var names = Object.keys(snap);
                for (var i = 0; i < names.length; i++) {
                    var nm = names[i];
                    var arr = Array.isArray(snap[nm]) ? snap[nm].slice() : [];
                    for (var j = 0; j < arr.length; j++) arr[j] = asString(arr[j]);
                    this._writeList(nm, arr);
                    this._enqueueHat(nm, 0, '', 'replaceAll');
                }
            }
        },

        // 把远端改动应用到本地列表，并触发对应帽块
        _applyRemote: function (msg) {
            var name = msg.name;
            if (!name) return;
            var list = this._ensureList(name);
            var oldVal = '';
            var idx = 0;

            switch (msg.type) {
                case 'set': {
                    idx = asIndex(msg.index, list.length);
                    oldVal = list[idx - 1];
                    list[idx - 1] = asString(msg.value);
                    break;
                }
                case 'insert': {
                    idx = asIndex(msg.index, list.length + 1);
                    list.splice(idx - 1, 0, asString(msg.value));
                    break;
                }
                case 'delete': {
                    idx = asIndex(msg.index, list.length);
                    oldVal = list[idx - 1];
                    list.splice(idx - 1, 1);
                    break;
                }
                case 'replaceAll': {
                    var arr = Array.isArray(msg.items) ? msg.items.slice() : [];
                    for (var i = 0; i < arr.length; i++) arr[i] = asString(arr[i]);
                    list = arr;
                    this._writeList(name, list);
                    this._enqueueHat(name, 0, '', 'replaceAll');
                    return;
                }
                case 'length': {
                    var target = Math.max(0, Math.floor(Scratch.Cast.toNumber(msg.length)));
                    while (list.length < target) list.push('');
                    list.length = target;
                    this._enqueueHat(name, 0, '', 'length');
                    return;
                }
                default:
                    return;
            }

            this._writeList(name, list);
            this._enqueueHat(name, idx, asString(oldVal), msg.type);
        },

        // 触发「当云列表 [...] 收到更新」帽块
        _enqueueHat: function (name, index, value, type) {
            this._lastList = name;
            this._lastIndex = index;
            this._lastValue = value;
            this._lastType = type;
            try {
                Scratch.vm.runtime.startHats('cloudlistsync_whenListUpdated', { LIST: name });
            } catch (e) {}
        },

        // ────────────────────────────────────────────────────────────
        // getInfo：定义积木
        // ────────────────────────────────────────────────────────────
        getInfo: function () {
            var self = this;
            return {
                id: 'cloudlistsync',
                name: '云列表同步',
                docsURI: 'https://github.com/',
                color1: '#5c6bc0',
                color2: '#3f4fa3',
                color3: '#283593',
                blocks: [
                    // ── 连接控制 ──
                    {
                        opcode: 'connect',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '连接到云列表服务器 [URL] 房间 [ROOM]',
                        arguments: {
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: WS_URL_DEFAULT },
                            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: ROOM_DEFAULT }
                        }
                    },
                    {
                        opcode: 'connectWithPassword',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '用密码 [PASSWORD] 连接到云列表服务器 [URL] 房间 [ROOM]',
                        arguments: {
                            PASSWORD: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: WS_URL_DEFAULT },
                            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: ROOM_DEFAULT }
                        }
                    },
                    {
                        opcode: 'disconnect',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '断开云列表服务器'
                    },
                    {
                        opcode: 'isConnected',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '已连接到云列表服务器？',
                        disableMonitor: true
                    },

                    // ── 配置（房间/服务器）──
                    {
                        opcode: 'setRoom',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置云列表房间为 [ROOM]',
                        arguments: {
                            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: ROOM_DEFAULT }
                        }
                    },
                    {
                        opcode: 'setServer',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置云列表服务器为 [URL]',
                        arguments: {
                            URL: { type: Scratch.ArgumentType.STRING, defaultValue: WS_URL_DEFAULT }
                        }
                    },

                    '---',

                    // ── 列表读写（会同步广播）──
                    {
                        opcode: 'setListItem',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置云列表 [LIST] 的第 [INDEX] 项为 [VALUE]',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' },
                            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    {
                        opcode: 'insertListItem',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '在云列表 [LIST] 的第 [INDEX] 项前插入 [VALUE]',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' },
                            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
                        }
                    },
                    {
                        opcode: 'deleteListItem',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '删除云列表 [LIST] 的第 [INDEX] 项',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' },
                            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    {
                        opcode: 'replaceAll',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '将云列表 [LIST] 的全部内容替换为 [ITEMS]（JSON 数组）',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' },
                            ITEMS: { type: Scratch.ArgumentType.STRING, defaultValue: '["a","b","c"]' }
                        }
                    },
                    {
                        opcode: 'setListLength',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把云列表 [LIST] 的长度设为 [LENGTH]',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' },
                            LENGTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    {
                        opcode: 'appendItem',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把 [VALUE] 加到云列表 [LIST] 末尾',
                        arguments: {
                            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' }
                        }
                    },

                    '---',

                    // ── 列表查询 ──
                    {
                        opcode: 'getListItem',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '云列表 [LIST] 的第 [INDEX] 项',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' },
                            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        },
                        disableMonitor: true
                    },
                    {
                        opcode: 'getListLength',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '云列表 [LIST] 的长度',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' }
                        },
                        disableMonitor: true
                    },
                    {
                        opcode: 'getListAsJSON',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '云列表 [LIST] 的全部内容（JSON 数组）',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' }
                        },
                        disableMonitor: true
                    },

                    '---',

                    // ── 事件帽块：当某云列表收到更新 ──
                    {
                        blockType: Scratch.BlockType.EVENT,
                        opcode: 'whenListUpdated',
                        text: '当云列表 [LIST] 收到更新',
                        isEdgeActivated: false,
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'listNames' }
                        }
                    },

                    // ── 帽块配套查询：这次更新是什么 ──
                    {
                        opcode: 'updatedList',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '被更新的云列表名',
                        disableMonitor: true
                    },
                    {
                        opcode: 'updatedIndex',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '更新的项位置',
                        disableMonitor: true
                    },
                    {
                        opcode: 'updatedOldValue',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '被替换/删除的旧值',
                        disableMonitor: true
                    },
                    {
                        opcode: 'updatedChangeType',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '更新类型',
                        disableMonitor: true
                    }
                ],
                menus: {
                    // 动态菜单：实时列出本作品舞台上的所有列表名
                    listNames: {
                        acceptReporters: true,
                        items: function () { return self._collectListNames(); }
                    }
                }
            };
        },

        // 收集运行时中所有列表的名字，供下拉菜单使用
        _collectListNames: function () {
            var names = [];
            var seen = Object.create(null);
            var rt = this._getRuntime();
            if (rt) {
                var targets = rt.targets || [];
                for (var i = 0; i < targets.length; i++) {
                    var vars = (targets[i] && targets[i].variables) || Object.create(null);
                    for (var id in vars) {
                        if (!Object.prototype.hasOwnProperty.call(vars, id)) continue;
                        var v = vars[id];
                        if (v && Array.isArray(v[1]) && !seen[v[0]]) {
                            seen[v[0]] = true;
                            names.push(v[0]);
                        }
                    }
                }
            }
            // 同时把我们"知道"的列表也列出来（尚未在运行时建变量、但被引用过的）
            var known = Object.keys(this._lists);
            for (var j = 0; j < known.length; j++) {
                if (!seen[known[j]]) {
                    seen[known[j]] = true;
                    names.push(known[j]);
                }
            }
            if (names.length === 0) names.push('云列表1');
            return names;
        },

        // ────────────────────────────────────────────────────────────
        // 积木实现
        // ────────────────────────────────────────────────────────────

        // 连接
        connect: function (args) {
            var url = Scratch.Cast.toString(args.URL) || WS_URL_DEFAULT;
            var room = Scratch.Cast.toString(args.ROOM) || ROOM_DEFAULT;
            this._wsUrl = url;
            this._room = room;
            this._password = '';
            this._connect();
        },

        connectWithPassword: function (args) {
            var url = Scratch.Cast.toString(args.URL) || WS_URL_DEFAULT;
            var room = Scratch.Cast.toString(args.ROOM) || ROOM_DEFAULT;
            this._wsUrl = url;
            this._room = room;
            this._password = Scratch.Cast.toString(args.PASSWORD) || '';
            this._connect();
        },

        disconnect: function () {
            this._disconnect();
        },

        isConnected: function () {
            return this._connected && this._ws && this._ws.readyState === 1;
        },

        setRoom: function (args) {
            this._room = Scratch.Cast.toString(args.ROOM) || ROOM_DEFAULT;
        },

        setServer: function (args) {
            var url = Scratch.Cast.toString(args.URL) || WS_URL_DEFAULT;
            this._wsUrl = url;
        },

        // 列表写操作（本地生效 + 广播）
        setListItem: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._ensureList(name);
            var idx = asIndex(args.INDEX, list.length);
            var value = asString(args.VALUE);
            list[idx - 1] = value;
            this._writeList(name, list);
            this._queueChange('set', name, { index: idx, value: value });
        },

        insertListItem: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._ensureList(name);
            var idx = asIndex(args.INDEX, list.length + 1);
            var value = asString(args.VALUE);
            list.splice(idx - 1, 0, value);
            this._writeList(name, list);
            this._queueChange('insert', name, { index: idx, value: value });
        },

        deleteListItem: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._ensureList(name);
            if (list.length === 0) return;
            var idx = asIndex(args.INDEX, list.length);
            list.splice(idx - 1, 1);
            this._writeList(name, list);
            this._queueChange('delete', name, { index: idx });
        },

        replaceAll: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var raw = Scratch.Cast.toString(args.ITEMS);
            var arr = [];
            try {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    arr = parsed;
                } else {
                    arr = [parsed];
                }
            } catch (e) {
                // 解析失败就把整段当成一个元素
                arr = [raw];
            }
            for (var i = 0; i < arr.length; i++) arr[i] = asString(arr[i]);
            this._writeList(name, arr);
            this._queueChange('replaceAll', name, { items: arr });
        },

        setListLength: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._ensureList(name);
            var target = Math.max(0, Math.floor(Scratch.Cast.toNumber(args.LENGTH)));
            while (list.length < target) list.push('');
            list.length = target;
            this._writeList(name, list);
            this._queueChange('length', name, { length: target });
        },

        appendItem: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._ensureList(name);
            var value = asString(args.VALUE);
            list.push(value);
            this._writeList(name, list);
            this._queueChange('insert', name, { index: list.length, value: value });
        },

        // 列表查询
        getListItem: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._readList(name);
            if (list.length === 0) return '';
            var idx = asIndex(args.INDEX, list.length);
            return asString(list[idx - 1]);
        },

        getListLength: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._readList(name);
            return list.length;
        },

        getListAsJSON: function (args) {
            var name = Scratch.Cast.toString(args.LIST);
            var list = this._readList(name);
            // 深拷贝成纯字符串数组，避免返回内部引用
            var out = new Array(list.length);
            for (var i = 0; i < list.length; i++) out[i] = asString(list[i]);
            return JSON.stringify(out);
        },

        // 帽块本体（只作标记，真正触发靠 _enqueueHat）
        whenListUpdated: function () { /* no-op */ },

        // 帽块上下文查询
        updatedList: function () {
            return this._lastList;
        },
        updatedIndex: function () {
            return this._lastIndex;
        },
        updatedOldValue: function () {
            return this._lastValue;
        },
        updatedChangeType: function () {
            return this._lastType;
        }
    };

    Scratch.extensions.register(new CloudListSync());
})(Scratch);
