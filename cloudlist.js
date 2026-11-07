// Name: Cloud List
// ID: cloudlist
// Description: 让多个 TurboWarp 作品共享同一个"云列表"——一个作品更新，其他作品自动同步
// By: yuanbao
// License: MIT
//
// ═══════════════════════════════════════════════════════════════
//  使 用 说 明
// ═══════════════════════════════════════════════════════════════
//
// 【前置：云服务器】
// 本扩展需要一个兼容 Scratch 云变量协议的 WebSocket 服务（wss:// 或 ws://）。
// 最省事的自建方案（官方开源，Node.js）：
//     git clone https://github.com/TurboWarp/cloud-server
//     cd cloud-server && npm install && npm start
//   默认监听 ws://localhost:9080/ 。要让别人也能连，需要部署到公网并配好 wss:// 。
//   注意：官方 cloud-server 默认只允许【数字】云变量值。要传 JSON 字符串列表，
//   需使用允许字符串值的服务/分支，或在服务端配置 allow_non_numeric=true（若支持）。
//
// 【在 TurboWarp 里加载】
//   编辑器中 添加扩展 → 自定义扩展 → 文件，选本文件。
//   注意：本扩展必须在"无沙盒(unsandboxed)"模式下运行。
//
// 【两个作品互相同步】
//   作品 A 和作品 B 都用同一块积木：
//      连接云服务器 [wss://你的服务地址/] 房间 [同一个房间名] 身份 [不同用户名]
//   之后任一方写云列表，另一方都会实时收到更新。
//
// ═══════════════════════════════════════════════════════════════
//  协议简述（Scratch 云变量协议）
// ═══════════════════════════════════════════════════════════════
//   握手（连上后先发）：
//     {"method":"handshake","project_id":"房间名","user":"用户名"}
//   写入（发给服务器）：
//     {"method":"set","name":"☁ cloudlist:列表名","value":"{\"v\":1,\"items\":[...]}"}
//   服务器把同房间的更新广播给所有其他连接端。
//   云变量名以 "☁ cloudlist:" 前缀区分不同列表；值为 JSON 字符串。

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Cloud List 扩展必须以 unsandboxed（无沙盒）模式运行');
  }

  var ROOM_PREFIX = 'cloudlist:';
  var PROTOCOL_VERSION = 1;

  // ── 模块级单例状态 ─────────────────────────────────────────
  var state = {
    socket: null,
    url: '',
    room: '',
    username: '',
    connected: false,
    intentionallyClosed: false,
    reconnectTimer: null,
    outbox: [],
    lists: Object.create(null),     // name -> {items, revision}
    lastUpdatedName: '',            // 最近被远程更新的列表名
    pendingHats: Object.create(null), // name -> true，供 hat 块边沿检测
    runtime: null
  };

  // ── 工具函数 ─────────────────────────────────────────────
  function safeStringify(items) {
    try {
      return JSON.stringify({ v: PROTOCOL_VERSION, items: items });
    } catch (e) {
      return JSON.stringify({ v: PROTOCOL_VERSION, items: [] });
    }
  }

  function safeParse(text) {
    if (typeof text !== 'string' || text === '') return null;
    try {
      var obj = JSON.parse(text);
      if (obj && Array.isArray(obj.items)) return obj.items;
      if (Array.isArray(obj)) return obj;
      return null;
    } catch (e) {
      return [String(text)];
    }
  }

  function sendRaw(name, value) {
    if (!state.connected || !state.socket) return false;
    try {
      state.socket.send(JSON.stringify({
        method: 'set',
        name: '☁ ' + ROOM_PREFIX + name,
        value: value
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function flushOutbox() {
    if (!state.outbox.length) return;
    var todo = state.outbox.slice();
    state.outbox.length = 0;
    for (var i = 0; i < todo.length; i++) {
      sendRaw(todo[i].name, todo[i].value);
    }
  }

  // 处理远程更新：更新本地缓存 + 触发 hat
  function applyRemoteUpdate(rawName, rawValue) {
    var items = safeParse(rawValue);
    if (!items) return;
    var listName = rawName.replace(/^☁\s*/, '').replace(new RegExp('^' + ROOM_PREFIX), '');
    var list = state.lists[listName];
    if (!list) {
      list = { items: items, revision: 1 };
      state.lists[listName] = list;
    } else {
      list.items = items;
      list.revision += 1;
    }
    state.lastUpdatedName = listName;
    state.pendingHats[listName] = true;
    if (state.runtime && typeof state.runtime.startHats === 'function') {
      try {
        state.runtime.startHats('cloudlist_whenListUpdated', { NAME: listName });
      } catch (e) { /* 忽略 */ }
    }
  }

  function clearReconnect() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  function hardClose() {
    state.intentionallyClosed = true;
    clearReconnect();
    if (state.socket) {
      try { state.socket.close(); } catch (e) { /* ignore */ }
      state.socket = null;
    }
    state.connected = false;
  }

  function openSocket() {
    state.intentionallyClosed = false;
    var ws;
    try {
      ws = new WebSocket(state.url);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    state.socket = ws;

    ws.onopen = function () {
      try {
        ws.send(JSON.stringify({
          method: 'handshake',
          project_id: state.room,
          user: state.username
        }));
      } catch (e) { /* ignore */ }
      state.connected = true;
      flushOutbox();
    };

    ws.onmessage = function (ev) {
      var data = String(ev.data || '');
      var parts = data.split('\n');
      for (var i = 0; i < parts.length; i++) {
        var chunk = parts[i].trim();
        if (!chunk) continue;
        var msg;
        try { msg = JSON.parse(chunk); } catch (e) { continue; }
        if (msg && msg.method === 'set' &&
            typeof msg.name === 'string' &&
            msg.name.indexOf(ROOM_PREFIX) >= 0) {
          applyRemoteUpdate(msg.name, msg.value);
        }
      }
    };

    ws.onclose = function () {
      state.connected = false;
      state.socket = null;
      if (!state.intentionallyClosed) scheduleReconnect();
    };

    ws.onerror = function () { /* onclose 随后触发，重连在那里处理 */ };
  }

  function scheduleReconnect() {
    clearReconnect();
    if (state.intentionallyClosed) return;
    state.reconnectTimer = setTimeout(function () {
      if (!state.intentionallyClosed) openSocket();
    }, 3000);
  }

  function ensureList(name) {
    if (!state.lists[name]) {
      state.lists[name] = { items: [], revision: 0 };
    }
    return state.lists[name];
  }

  // 写入并广播
  function publish(name, items) {
    var list = ensureList(name);
    list.items = items;
    list.revision += 1;
    var payload = safeStringify(items);
    if (state.connected) {
      sendRaw(name, payload);
    } else {
      // 未连接时缓存，连上后发出；仅保留最新一次
      var found = false;
      for (var i = 0; i < state.outbox.length; i++) {
        if (state.outbox[i].name === name) {
          state.outbox[i].value = payload;
          found = true;
          break;
        }
      }
      if (!found) state.outbox.push({ name: name, value: payload });
    }
    return list;
  }

  // ── 扩展类 ───────────────────────────────────────────────
  function CloudList() {}

  CloudList.prototype.getInfo = function () {
    return {
      id: 'cloudlist',
      name: '云列表',
      color1: '#0f9f6e',
      color2: '#0b7f58',
      color3: '#086246',
      docsURI: 'https://github.com/TurboWarp/cloud-server',
      blocks: [
        // ▸ 连接管理
        {
          opcode: 'connect',
          blockType: Scratch.BlockType.COMMAND,
          text: '连接云服务器 [URL] 房间 [ROOM] 身份 [USERNAME]',
          arguments: {
            URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'ws://localhost:9080/' },
            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: 'my-room' },
            USERNAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'player1' }
          }
        },
        {
          opcode: 'disconnect',
          blockType: Scratch.BlockType.COMMAND,
          text: '断开云服务器连接'
        },
        {
          opcode: 'isConnected',
          blockType: Scratch.BlockType.BOOLEAN,
          text: '已连接云服务器?'
        },
        {
          opcode: 'connectionStatus',
          blockType: Scratch.BlockType.REPORTER,
          text: '连接状态'
        },

        // ▸ 写入
        {
          opcode: 'setList',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置云列表 [NAME] 为 [VALUE]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' },
            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '["苹果","香蕉","橙子"]' }
          }
        },
        {
          opcode: 'addItem',
          blockType: Scratch.BlockType.COMMAND,
          text: '把 [VALUE] 加入云列表 [NAME]',
          arguments: {
            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '新元素' },
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' }
          }
        },
        {
          opcode: 'deleteItem',
          blockType: Scratch.BlockType.COMMAND,
          text: '删除云列表 [NAME] 的第 [INDEX] 项',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' },
            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: '1' }
          }
        },
        {
          opcode: 'replaceItem',
          blockType: Scratch.BlockType.COMMAND,
          text: '将云列表 [NAME] 第 [INDEX] 项替换为 [VALUE]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' },
            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: '1' },
            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '新值' }
          }
        },
        {
          opcode: 'clearList',
          blockType: Scratch.BlockType.COMMAND,
          text: '清空云列表 [NAME]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' }
          }
        },

        // ▸ 读取
        {
          opcode: 'getList',
          blockType: Scratch.BlockType.REPORTER,
          text: '云列表 [NAME]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' }
          }
        },
        {
          opcode: 'getItem',
          blockType: Scratch.BlockType.REPORTER,
          text: '云列表 [NAME] 第 [INDEX] 项',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' },
            INDEX: { type: Scratch.ArgumentType.NUMBER, defaultValue: '1' }
          }
        },
        {
          opcode: 'lengthOf',
          blockType: Scratch.BlockType.REPORTER,
          text: '云列表 [NAME] 的长度',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' }
          }
        },
        {
          opcode: 'contains',
          blockType: Scratch.BlockType.BOOLEAN,
          text: '云列表 [NAME] 包含 [VALUE] ?',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' },
            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: '香蕉' }
          }
        },
        {
          opcode: 'revisionOf',
          blockType: Scratch.BlockType.REPORTER,
          text: '云列表 [NAME] 的版本号',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' }
          }
        },

        // ▸ 事件
        {
          opcode: 'whenListUpdated',
          blockType: Scratch.BlockType.HAT,
          text: '当云列表 [NAME] 收到更新时',
          isEdgeTriggered: true,
          shouldRestart: true,
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'list1' }
          }
        },
        {
          opcode: 'lastUpdatedList',
          blockType: Scratch.BlockType.REPORTER,
          text: '最后更新的云列表名'
        }
      ]
    };
  };

  // ── 连接类实现 ─────────────────────────────────────────
  CloudList.prototype.connect = function (args) {
    var url = String(args.URL || '').trim();
    var room = String(args.ROOM || 'default-room').trim();
    var username = String(args.USERNAME ||
      ('player' + Math.floor(Math.random() * 9000 + 1000))).trim();
    if (!url || !room) return;
    if (state.socket) hardClose();
    state.url = url;
    state.room = room;
    state.username = username || 'player';
    openSocket();
  };

  CloudList.prototype.disconnect = function () { hardClose(); };

  CloudList.prototype.isConnected = function () { return !!state.connected; };

  CloudList.prototype.connectionStatus = function () {
    if (state.connected) return '已连接';
    if (state.socket) return '连接中';
    return '未连接';
  };

  // ── 写入类实现 ─────────────────────────────────────────
  CloudList.prototype.setList = function (args) {
    var name = String(args.NAME || '');
    var items = safeParse(String(args.VALUE != null ? args.VALUE : ''));
    if (items === null) items = [String(args.VALUE != null ? args.VALUE : '')];
    publish(name, items);
  };

  CloudList.prototype.addItem = function (args) {
    var name = String(args.NAME || '');
    var list = ensureList(name);
    var items = list.items.slice();
    items.push(args.VALUE != null ? String(args.VALUE) : '');
    publish(name, items);
  };

  CloudList.prototype.deleteItem = function (args) {
    var name = String(args.NAME || '');
    var list = ensureList(name);
    var idx = Math.floor(Number(args.INDEX));
    if (idx >= 1 && idx <= list.items.length) {
      var items = list.items.slice();
      items.splice(idx - 1, 1);
      publish(name, items);
    }
  };

  CloudList.prototype.replaceItem = function (args) {
    var name = String(args.NAME || '');
    var list = ensureList(name);
    var idx = Math.floor(Number(args.INDEX));
    if (idx >= 1 && idx <= list.items.length) {
      var items = list.items.slice();
      items[idx - 1] = args.VALUE != null ? String(args.VALUE) : '';
      publish(name, items);
    }
  };

  CloudList.prototype.clearList = function (args) {
    publish(String(args.NAME || ''), []);
  };

  // ── 读取类实现 ─────────────────────────────────────────
  CloudList.prototype.getList = function (args) {
    return safeStringify(ensureList(String(args.NAME || '')).items);
  };

  CloudList.prototype.getItem = function (args) {
    var list = ensureList(String(args.NAME || ''));
    var idx = Math.floor(Number(args.INDEX));
    if (idx >= 1 && idx <= list.items.length) {
      var v = list.items[idx - 1];
      return v == null ? '' : String(v);
    }
    return '';
  };

  CloudList.prototype.lengthOf = function (args) {
    return ensureList(String(args.NAME || '')).items.length;
  };

  CloudList.prototype.contains = function (args) {
    var target = String(args.VALUE != null ? args.VALUE : '');
    var items = ensureList(String(args.NAME || '')).items;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i]) === target) return true;
    }
    return false;
  };

  CloudList.prototype.revisionOf = function (args) {
    return ensureList(String(args.NAME || '')).revision;
  };

  // ── 事件类实现 ─────────────────────────────────────────
  // 边沿触发：只有该列表刚收到过远程更新时才返回 true
  CloudList.prototype.whenListUpdated = function (args, util) {
    var name = String(args.NAME || '');
    if (state.pendingHats[name]) {
      state.pendingHats[name] = false;
      return true;
    }
    return false;
  };

  CloudList.prototype.lastUpdatedList = function () {
    return state.lastUpdatedList || '';
  };

  // ── 注册，并尽量拿到 runtime 引用 ──────────────────────
  var ext = new CloudList();

  var originalRegister = Scratch.extensions.register;
  Scratch.extensions.register = function (instance) {
    try {
      var vm = (typeof window !== 'undefined') ? window.vm : null;
      if (vm && vm.runtime) state.runtime = vm.runtime;
    } catch (e) { /* ignore */ }
    return originalRegister(instance);
  };

  Scratch.extensions.register(ext);
})(Scratch);
