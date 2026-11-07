// Name: Line Viewer
// ID: lineviewer
// Description: 查看多行文本的行数、指定行、行范围与关键词所在行
// By: yuanbao
// License: MIT

(function (Scratch) {
  'use strict';

  // 把任意换行符统一拆成数组，空文本视为一个空行
  function splitLines(text) {
    const str = String(text == null ? '' : text);
    if (str.length === 0) return [''];
    // \r\n 先压成 \n，再去掉剩余的 \r
    const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.split('\n');
  }

  // 行号支持 "5"、"3-8"、"8-3"、"-5"（开头到 5）、"7-"（7 到末尾）
  function parseRange(expr, total) {
    const raw = String(expr == null ? '' : expr).trim();
    let start, end;
    if (raw.indexOf('-') !== -1) {
      const parts = raw.split('-');
      const a = parts[0].trim();
      const b = parts[1].trim();
      start = a === '' ? 1 : Math.max(1, parseInt(a, 10) || 1);
      end = b === '' ? total : Math.max(1, parseInt(b, 10) || total);
    } else {
      const n = Math.max(1, parseInt(raw, 10) || 1);
      start = end = n;
    }
    if (start > end) { const t = start; start = end; end = t; }
    if (start > total) start = total;
    return { start, end };
  }

  class LineViewer {
    getInfo() {
      return {
        id: 'lineviewer',
        name: 'Line Viewer',
        color1: '#4b6f44',
        color2: '#3d5a38',
        color3: '#2f452b',
        blocks: [
          {
            opcode: 'lineCount',
            blockType: Scratch.BlockType.REPORTER,
            text: '行数 of [TEXT]',
            arguments: {
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'first line\nsecond line\nthird line' }
            }
          },
          {
            opcode: 'lineAt',
            blockType: Scratch.BlockType.REPORTER,
            text: 'line [LINE] of [TEXT]',
            arguments: {
              LINE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'first line\nsecond line\nthird line' }
            }
          },
          {
            opcode: 'linesRange',
            blockType: Scratch.BlockType.REPORTER,
            text: 'lines [RANGE] of [TEXT] join with [JOINER]',
            arguments: {
              RANGE: { type: Scratch.ArgumentType.STRING, defaultValue: '2-4' },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'line 1\nline 2\nline 3\nline 4\nline 5' },
              JOINER: { type: Scratch.ArgumentType.STRING, defaultValue: '\n' }
            }
          },
          {
            opcode: 'findLines',
            blockType: Scratch.BlockType.REPORTER,
            text: 'lines containing [KEYWORD] in [TEXT]',
            arguments: {
              KEYWORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'error' },
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'error: file not found\nok\nerror: timeout' }
            }
          },
          {
            opcode: 'writeLinesToList',
            blockType: Scratch.BlockType.COMMAND,
            text: 'write lines of [TEXT] into list [LIST]',
            arguments: {
              TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'first line\nsecond line\nthird line' },
              LIST: { type: Scratch.ArgumentType.STRING, menu: 'LIST_MENU' }
            }
          }
        ],
        menus: {
          LIST_MENU: {
            acceptReporters: true,
            items: () => Scratch.vm.runtime.getTargets()
              .filter(t => t.isOriginal && t.variables)
              .flatMap(t => Object.values(t.variables))
              .filter(v => v.type === 'list')
              .map(v => v.name)
          }
        }
      };
    }

    lineCount(args) {
      return splitLines(args.TEXT).length;
    }

    lineAt(args) {
      const n = Math.max(1, parseInt(args.LINE, 10) || 1);
      const lines = splitLines(args.TEXT);
      return n <= lines.length ? lines[n - 1] : '';
    }

    linesRange(args) {
      const lines = splitLines(args.TEXT);
      const { start, end } = parseRange(args.RANGE, lines.length);
      const joiner = String(args.JOINER == null ? '\n' : args.JOINER);
      const slice = [];
      for (let i = start; i <= end && i <= lines.length; i++) {
        slice.push(lines[i - 1]);
      }
      return slice.join(joiner);
    }

    findLines(args) {
      const keyword = String(args.KEYWORD == null ? '' : args.KEYWORD);
      const lines = splitLines(args.TEXT);
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf(keyword) !== -1) hits.push(i + 1);
      }
      return hits.join(', ');
    }

    writeLinesToList(args) {
      const listName = String(args.LIST == null ? '' : args.LIST).trim();
      if (!listName) return;
      const lines = splitLines(args.TEXT);
      const targets = Scratch.vm.runtime.getTargets().filter(t => t.isOriginal && t.variables);
      for (const t of targets) {
        for (const v of Object.values(t.variables)) {
          if (v.type === 'list' && v.name === listName) {
            // value 是引用，直接 splice 改写
            v.value.length = 0;
            for (const line of lines) v.value.push(line);
            return;
          }
        }
      }
    }
  }

  Scratch.extensions.register(new LineViewer());
})(Scratch);
