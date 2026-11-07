/**
 * 系统弹窗扩展 (System Dialogs) for TurboWarp / Scratch 3
 * 作者: Yuanbao
 * 用法: TurboWarp 编辑器 -> 左下角「扩展」-> 「自定义扩展」-> 选择本 .js 文件
 *
 * 说明:
 *  - 浏览器原生的 alert/confirm/prompt 不能自定义标题栏文字, 所以本扩展主推「自绘弹窗」,
 *    外观仿系统对话框, 标题 / 内容 / 按键全部可自定义, 并且支持任意多个按键。
 *  - Scratch 的积木格式不支持在积木上动态增加输入框(没有真正的 "+" 号),
 *    因此这里提供两种等价写法来模拟 "(+)":
 *      1) 在积木的「追加按键」输入框里用英文逗号分隔: 重试,忽略,帮助
 *      2) 先用「添加弹窗按键 xxx」积木一个个加, 再用「使用已添加的按键」弹出
 */

(function (Scratch) {
  'use strict';

  const MAX_BUTTONS = 8;

  const icon = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  const ICON = icon(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
      '<rect x="3.5" y="7" width="33" height="26" rx="4" fill="#ffffff" stroke="#4C97FF" stroke-width="3"/>' +
      '<path d="M3.5 11a4 4 0 0 1 4-4h25a4 4 0 0 1 4 4v4h-33z" fill="#4C97FF"/>' +
      '<rect x="9" y="19" width="22" height="3" rx="1.5" fill="#4C97FF"/>' +
      '<rect x="9" y="25" width="13" height="3" rx="1.5" fill="#4C97FF"/>' +
      '</svg>'
  );

  const CSS = `
.twsysdlg-mask{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;
  background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;
  font-family:"Segoe UI","Microsoft YaHei","PingFang SC","Helvetica Neue",Arial,sans-serif;}
.twsysdlg-box{background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);
  min-width:280px;max-width:min(90vw,440px);padding:20px 22px 14px;color:#222;user-select:none;}
.twsysdlg-title{margin:0 0 10px;font-size:17px;font-weight:700;line-height:1.4;word-break:break-word;}
.twsysdlg-text{margin:0 0 16px;font-size:14px;line-height:1.6;color:#444;white-space:pre-wrap;word-break:break-word;}
.twsysdlg-input{width:100%;box-sizing:border-box;margin:0 0 16px;padding:8px 10px;font-size:14px;
  border:1px solid #c9d3e0;border-radius:6px;outline:none;color:#222;}
.twsysdlg-input:focus{border-color:#4C97FF;box-shadow:0 0 0 3px rgba(76,151,255,.18);}
.twsysdlg-btns{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;}
.twsysdlg-btn{appearance:none;border:1px solid #c9d3e0;background:#fff;color:#333;
  padding:7px 16px;border-radius:6px;font-size:14px;cursor:pointer;min-width:72px;transition:.15s;}
.twsysdlg-btn:hover{background:#f2f6fc;border-color:#9dbbe8;}
.twsysdlg-btn:active{transform:translateY(1px);}
.twsysdlg-btn.primary{background:#4C97FF;border-color:#4C97FF;color:#fff;font-weight:600;}
.twsysdlg-btn.primary:hover{background:#3d86ea;}
`;

  function toText(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  /** 把 "确定, 取消 ,重试" 解析成 ['确定','取消','重试'] */
  function parseList(str) {
    return toText(str)
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  class SystemDialogs {
    constructor() {
      this.buttons = [];       // 「添加弹窗按键」累积的按键
      this.lastButton = '';    // 最近一次被按下的按键
      this.mask = null;
      this.resolveFn = null;
      this.onKey = null;
      this._injectCSS();
    }

    _injectCSS() {
      if (document.getElementById('twsysdlg-style')) return;
      const style = document.createElement('style');
      style.id = 'twsysdlg-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    getInfo() {
      return {
        id: 'systemdialogs',
        name: '系统弹窗',
        menuIconURI: ICON,
        blockIconURI: ICON,
        color1: '#4C97FF',
        color2: '#3373CC',
        color3: '#2E64A8',
        blocks: [
          {
            opcode: 'openDialog',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出弹窗 标题 [TITLE] 内容 [CONTENT] 按键 [B1] [B2] 追加按键 [MORE]',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '提示' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你确定要继续吗？' },
              B1: { type: Scratch.ArgumentType.STRING, defaultValue: '确定' },
              B2: { type: Scratch.ArgumentType.STRING, defaultValue: '取消' },
              MORE: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'openDialogWithList',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出弹窗 标题 [TITLE] 内容 [CONTENT] 使用已添加的按键',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '提示' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你确定要继续吗？' }
            }
          },
          {
            opcode: 'addButton',
            blockType: Scratch.BlockType.COMMAND,
            text: '添加弹窗按键 [BTN]',
            arguments: {
              BTN: { type: Scratch.ArgumentType.STRING, defaultValue: '重试' }
            }
          },
          {
            opcode: 'clearButtons',
            blockType: Scratch.BlockType.COMMAND,
            text: '清空弹窗按键'
          },
          {
            opcode: 'inputDialog',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出输入框 标题 [TITLE] 内容 [CONTENT] 默认 [DEFAULT]',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '请输入' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你的名字是？' },
              DEFAULT: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'lastButton',
            blockType: Scratch.BlockType.REPORTER,
            text: '被按下的按键'
          },
          '---',
          {
            opcode: 'nativeAlert',
            blockType: Scratch.BlockType.COMMAND,
            text: '浏览器原生提示 内容 [CONTENT]',
            arguments: {
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你好！' }
            }
          },
          {
            opcode: 'nativeConfirm',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '浏览器原生确认 内容 [CONTENT]',
            arguments: {
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你确定吗？' }
            }
          },
          {
            opcode: 'nativePrompt',
            blockType: Scratch.BlockType.REPORTER,
            text: '浏览器原生输入 内容 [CONTENT] 默认 [DEFAULT]',
            arguments: {
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '请输入内容' },
              DEFAULT: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'closeDialog',
            blockType: Scratch.BlockType.COMMAND,
            text: '关闭所有弹窗'
          }
        ]
      };
    }

    /* ---------- 积木实现 ---------- */

    openDialog(args) {
      const btns = [toText(args.B1), toText(args.B2)]
        .concat(parseList(args.MORE))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return this._dialog(toText(args.TITLE), toText(args.CONTENT), btns.length ? btns : ['确定'], null);
    }

    openDialogWithList(args) {
      const btns = this.buttons.length ? this.buttons.slice() : ['确定', '取消'];
      return this._dialog(toText(args.TITLE), toText(args.CONTENT), btns, null);
    }

    addButton(args) {
      const label = toText(args.BTN).trim();
      if (label && this.buttons.length < MAX_BUTTONS) this.buttons.push(label);
    }

    clearButtons() {
      this.buttons = [];
    }

    inputDialog(args) {
      const buttons = ['确定', '取消'];
      return this._dialog(toText(args.TITLE), toText(args.CONTENT), buttons, {
        value: toText(args.DEFAULT),
        okButton: '确定'
      });
    }

    lastButton() {
      return this.lastButton;
    }

    nativeAlert(args) {
      window.alert(toText(args.CONTENT));
    }

    nativeConfirm(args) {
      return !!window.confirm(toText(args.CONTENT));
    }

    nativePrompt(args) {
      const r = window.prompt(toText(args.CONTENT), toText(args.DEFAULT));
      return r === null ? '' : r;
    }

    closeDialog() {
      this._close('');
    }

    /* ---------- 弹窗核心 ---------- */

    _close(value) {
      if (this.onKey) {
        document.removeEventListener('keydown', this.onKey);
        this.onKey = null;
      }
      if (this.mask && this.mask.parentNode) this.mask.parentNode.removeChild(this.mask);
      this.mask = null;
      if (this.resolveFn) {
        const fn = this.resolveFn;
        this.resolveFn = null;
        fn(value);
      }
    }

    /**
     * @param {string} title   标题
     * @param {string} content 内容
     * @param {string[]} buttons 按键文字
     * @param {?{value:string, okButton:string}} input 带输入框时的配置
     * @returns {Promise<string>} 被按下的按键文字(带输入框时: 点确定返回输入内容, 否则返回 '')
     */
    _dialog(title, content, buttons, input) {
      this._close('');
      const self = this;
      return new Promise((resolve) => {
        const list = (Array.isArray(buttons) ? buttons : []).slice(0, MAX_BUTTONS);
        if (!list.length) list.push('确定');

        const mask = document.createElement('div');
        mask.className = 'twsysdlg-mask';

        const box = document.createElement('div');
        box.className = 'twsysdlg-box';

        const h = document.createElement('div');
        h.className = 'twsysdlg-title';
        h.textContent = title || '提示';
        box.appendChild(h);

        if (content) {
          const p = document.createElement('div');
          p.className = 'twsysdlg-text';
          p.textContent = content;
          box.appendChild(p);
        }

        let inputEl = null;
        if (input) {
          inputEl = document.createElement('input');
          inputEl.className = 'twsysdlg-input';
          inputEl.type = 'text';
          inputEl.value = input.value || '';
          box.appendChild(inputEl);
        }

        const row = document.createElement('div');
        row.className = 'twsysdlg-btns';

        const finish = (label) => {
          self.lastButton = label;
          let result = label;
          if (input) {
            result = label === input.okButton ? (inputEl ? inputEl.value : '') : '';
          }
          self._close(result);
        };

        list.forEach((label, i) => {
          const b = document.createElement('button');
          b.className = 'twsysdlg-btn' + (i === 0 ? ' primary' : '');
          b.textContent = label;
          b.addEventListener('click', () => finish(label));
          row.appendChild(b);
        });
        box.appendChild(row);

        mask.appendChild(box);
        document.body.appendChild(mask);

        self.mask = mask;
        self.resolveFn = resolve;
        self.onKey = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            self.lastButton = '';
            self._close('');
          } else if (e.key === 'Enter' && e.target !== inputEl) {
            e.preventDefault();
            finish(list[0]);
          }
        };
        document.addEventListener('keydown', self.onKey);

        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        } else if (row.firstChild) {
          row.firstChild.focus();
        }
      });
    }
  }

  Scratch.extensions.register(new SystemDialogs());
})(Scratch);
