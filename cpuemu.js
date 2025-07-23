"use strict";
// cpuメモリを疑似的に作成
let memory = new Uint16Array(2 ** 16);
// レジスタ確保
let registr = new Uint16Array(16);
// PC
let PC = 0;
// output
let output = new Uint16Array(16);
// フラグ
let Carryflag = false;
let Zeroflag = false;
// スタック
const stack = [];
// VRAM設定
let VRAM_START = 0x0F00;
const VRAM_WIDTH = 32;
const VRAM_HEIGHT = 32;
const canvas = document.getElementById("vram-canvas");
const ctx = canvas.getContext("2d");
const scale = 8; // 拡大スケール（見やすくする用）
ctx.imageSmoothingEnabled = false;
canvas.style.width = `${canvas.width * scale}px`;
canvas.style.height = `${canvas.height * scale}px`;
// dxdy
// html入力
const inputBox = document.getElementById("input-box");
const registers = [];
const outputs = [];
const PCElement = document.getElementById("PC");
let nowread = 0;
const clockBtn = document.getElementById("clock-btn");
let intervalId = null;
let memStart = 0x0000; // 表示開始アドレス
const clock_speed = document.getElementById("clock-speed");
// VRAM
const VRAMstrat = document.getElementById("VRAMstrat");
// 色付け用
// アクセスログ
let accessedRegisters = new Set();
let accessedMemory = new Set();
let accessedRegisters2 = new Set();
let accessedMemory2 = new Set();
let accessedRegisters3 = new Set();
let accessedMemory3 = new Set();
// 使用したのもすべて
let accessedallMemory = new Set();
let accessedallRegister = new Set();
// アウトプットポート用
let accessedouts = new Set();
let accessedouts2 = new Set();
let accessedouts3 = new Set();
// 使用したのもすべて
let accessedallout = new Set();
function union(setA, setB) {
    const result = new Set(setB);
    for (const elem of setA) {
        result.add(elem);
    }
    return result;
}
const labelMap = new Map();
if (PCElement) {
    PCElement.textContent = `PCアドレス:${PC}`;
}
else {
    throw new Error(`PC用の奴がねえぞ栗原`);
}
// レジスタ
for (let i = 0; i < 16; i++) {
    const el = document.getElementById("R" + i);
    if (el) {
        el.textContent = `R${i}:0x${registr[i].toString(16).toUpperCase().padStart(4, "0")}`;
        registers.push(el);
    }
    else {
        throw new Error(`R${i} が存在しません`);
    }
}
// out
for (let i = 0; i < 16; i++) {
    const el = document.getElementById("out" + i);
    if (el) {
        el.textContent = `0x${output[i].toString(16).toUpperCase().padStart(4, "0")}`;
        outputs.push(el);
    }
    else {
        throw new Error(`out${i} が存在しません`);
    }
}
// 確認
function display() {
    // レジスタ
    for (let i = 0; i < 16; i++) {
        const el = document.getElementById("R" + i);
        if (el) {
            if (accessedRegisters.has(i)) {
                el.style.backgroundColor = "lightpink";
            }
            else if (accessedRegisters2.has(i)) {
                el.style.backgroundColor = "lightyellow";
            }
            else if (accessedRegisters3.has(i)) {
                el.style.backgroundColor = "lightblue";
            }
            else if (accessedallRegister.has(i)) {
                el.style.backgroundColor = "lightgreen";
            }
            else {
                el.style.backgroundColor = "";
            }
            el.innerText = `R${i}:0x${registr[i].toString(16).toUpperCase().padStart(4, "0")}`;
            registers.push(el);
        }
        else {
            throw new Error(`R${i} が存在しません`);
        }
    }
    // out
    for (let i = 0; i < 16; i++) {
        let el = outputs[i];
        if (el) {
            if (accessedouts.has(i)) {
                el.style.backgroundColor = "lightpink";
            }
            else if (accessedouts2.has(i)) {
                el.style.backgroundColor = "lightyellow";
            }
            else if (accessedouts3.has(i)) {
                el.style.backgroundColor = "lightblue";
            }
            else if (accessedallout.has(i)) {
                el.style.backgroundColor = "lightgreen";
            }
            else {
                el.style.backgroundColor = "";
            }
            el.textContent = `0x${output[i].toString(16).toUpperCase().padStart(4, "0")}`;
        }
        else {
            throw new Error(`out${i} が存在しません`);
        }
    }
    // PC
    if (PCElement) {
        PCElement.textContent = `PCアドレス:${PC}`;
    }
    else {
        throw new Error(`PC用の奴がねえぞ栗原`);
    }
    renderMemoryRow(memStart);
    drawVRAM();
}
function drawVRAM() {
    const imageData = ctx.createImageData(VRAM_WIDTH, VRAM_HEIGHT);
    const pixelData = imageData.data; // Uint8ClampedArray
    let pixelIndex = 0;
    for (let i = 0; i < VRAM_HEIGHT * VRAM_WIDTH; i++) {
        const word = memory[i + VRAM_START];
        for (let bit = 15; bit >= 0; bit--) {
            const bitValue = (word >> bit) & 1;
            const color = bitValue ? 255 : 0;
            pixelData[pixelIndex++] = color; // R
            pixelData[pixelIndex++] = color; // G
            pixelData[pixelIndex++] = color; // B
            pixelData[pixelIndex++] = 255; // A
        }
    }
    ctx.putImageData(imageData, 0, 0);
}
const button = document.getElementById("submit-btn");
const resetbutton = document.getElementById("reset-btn");
resetbutton.addEventListener("click", () => {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
    clockBtn.textContent = "開始";
    inputBox.readOnly = false;
    registr.fill(0);
    memory.fill(0);
    output.fill(0);
    accessedRegisters.clear();
    accessedMemory.clear();
    accessedouts.clear();
    accessedRegisters2.clear();
    accessedMemory2.clear();
    accessedouts2.clear();
    accessedRegisters3.clear();
    accessedMemory3.clear();
    accessedouts3.clear();
    accessedallMemory.clear();
    accessedallRegister.clear();
    accessedallout.clear();
    renderMemoryRow();
    PC = 0;
    nowread = 0;
    display();
});
// オペランドから値を取得する関数
function getValue(operand) {
    if (operand.startsWith("#")) {
        // 即値
        return parseInt(operand.substring(1));
    }
    else if (operand.startsWith("R")) {
        // レジスタ
        const regIndex = parseInt(operand.substring(1));
        accessedRegisters.add(regIndex);
        return registr[regIndex];
    }
    else if (operand.startsWith("[") && operand.endsWith("]")) {
        // メモリ参照
        const addr = parseInt(operand.slice(1, -1));
        accessedMemory.add(addr);
        return memory[addr];
    }
    else {
        throw new Error(`不明なオペランド: ${operand}`);
    }
}
// オペランドに値を書き込む関数
function setValue(operand, value) {
    if (operand.startsWith("R")) {
        const regIndex = parseInt(operand.substring(1));
        accessedRegisters.add(regIndex);
        registr[regIndex] = value;
    }
    else if (operand.startsWith("[") && operand.endsWith("]")) {
        const addr = parseInt(operand.slice(1, -1));
        accessedMemory.add(addr);
        memory[addr] = value;
    }
    else {
        throw new Error(`代入先が不明: ${operand}`);
    }
}
function renderMemoryRow(start = 0x1000, count = 16 * 16) {
    const view = document.getElementById("memory-view");
    view.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const addr = start + i;
        const val = memory[addr];
        const cell = document.createElement("div");
        cell.className = "mem-cell";
        if (accessedMemory.has(addr)) {
            cell.style.backgroundColor = "lightpink";
        }
        else if (accessedMemory2.has(addr)) {
            cell.style.backgroundColor = "lightyellow";
        }
        else if (accessedMemory3.has(addr)) {
            cell.style.backgroundColor = "lightblue";
        }
        else if (accessedallMemory.has(addr)) {
            cell.style.backgroundColor = "lightgreen";
        }
        else {
            cell.style.backgroundColor = "";
        }
        cell.innerText = `0x${addr.toString(16).padStart(4, '0').toUpperCase()}:${val.toString(16).padStart(4, '0').toUpperCase()}`;
        view.appendChild(cell);
    }
}
renderMemoryRow(memStart);
// 汎用的な命令実行関数の例（ここではMOVだけ対応）
function executeInstruction(mnemonic, args, linevalue) {
    console.log(mnemonic, "and", args);
    let val;
    let target = args[0];
    let targetLine;
    switch (mnemonic.toUpperCase()) {
        // MOV
        case "MOV":
            if (args.length !== 2)
                throw new Error("MOV命令は引数2つ必須");
            val = getValue(args[1]);
            setValue(args[0], val);
            PC += 1;
            break;
        // ADD
        case "ADD":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 3)
                throw new Error("ADD命令は引数3つ必須");
            val = getValue(args[0]);
            // オーバーフロー
            if (val + getValue(args[1]) > 0xFFFF) {
                Carryflag = true;
            }
            val += getValue(args[1]);
            // ゼロフラグ
            if ((val & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[2], val);
            PC += 1;
            break;
        // SUB
        case "SUB":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 3)
                throw new Error("SUB命令は引数3つ必須");
            val = getValue(args[0]);
            // キャリーフラグ
            if (val < getValue(args[1])) {
                Carryflag = true;
            }
            val -= getValue(args[1]);
            // ゼロフラグ
            if ((val & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[2], val);
            PC += 1;
            break;
        // MUL
        case "MUL":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 3)
                throw new Error("MUL命令は引数3つ必須");
            val = getValue(args[0]);
            // オーバーフロー
            if (val * getValue(args[1]) > 0xFFFF) {
                Carryflag = true;
            }
            val *= getValue(args[1]);
            if ((val & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[2], val);
            PC += 1;
            break;
        // DIV
        case "DIV":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 3)
                throw new Error("DIV命令は引数3つ必須");
            val = getValue(args[0]);
            if (getValue(args[1]) == 0) {
                alert("割る数に0は不可能です");
                nowread = NaN;
                PC = NaN;
            }
            val /= getValue(args[1]);
            if ((Math.floor(val) & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[2], Math.floor(val));
            PC += 1;
            break;
        // MOD
        case "MOD":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 3)
                throw new Error("MOD命令は引数3つ必須");
            val = getValue(args[0]);
            if (getValue(args[1]) == 0) {
                alert("割る数に0は不可能です");
                nowread = NaN;
                PC = NaN;
            }
            val = val % getValue(args[1]);
            if ((Math.floor(val) & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[2], Math.floor(val));
            PC += 1;
            break;
        // JMP
        case "JMP":
            if (args.length !== 1)
                throw new Error("JMP命令は引数1つ必須");
            target = args[0];
            if (/^\d+$/.test(target)) {
                // 数字で指定されたジャンプ
                targetLine = parseInt(target);
            }
            else if (labelMap.has(target)) {
                // ラベルで指定されたジャンプ
                targetLine = labelMap.get(target);
            }
            else {
                throw new Error(`ラベル ${target} が見つかりません`);
            }
            PC = targetLine;
            nowread = targetLine - 1;
            break;
        case "JC":
            if (args.length !== 1)
                throw new Error("JC命令は引数1つ必須");
            target = args[0];
            if (Carryflag) {
                if (/^\d+$/.test(target)) {
                    // 数字で指定されたジャンプ
                    targetLine = parseInt(target);
                }
                else if (labelMap.has(target)) {
                    // ラベルで指定されたジャンプ
                    targetLine = labelMap.get(target);
                }
                else {
                    throw new Error(`ラベル ${target} が見つかりません`);
                }
                PC = targetLine;
                nowread = targetLine - 1;
            }
            else {
                PC += 1;
            }
            break;
        case "JNC":
            if (args.length !== 1)
                throw new Error("JNC命令は引数1つ必須");
            target = args[0];
            if (!Carryflag) {
                if (/^\d+$/.test(target)) {
                    // 数字で指定されたジャンプ
                    targetLine = parseInt(target);
                }
                else if (labelMap.has(target)) {
                    // ラベルで指定されたジャンプ
                    targetLine = labelMap.get(target);
                }
                else {
                    throw new Error(`ラベル ${target} が見つかりません`);
                }
                PC = targetLine;
                nowread = targetLine - 1;
            }
            else {
                PC += 1;
            }
            break;
        case "JZ":
            if (args.length !== 1)
                throw new Error("JZ命令は引数1つ必須");
            target = args[0];
            if (Zeroflag) {
                if (/^\d+$/.test(target)) {
                    // 数字で指定されたジャンプ
                    targetLine = parseInt(target);
                }
                else if (labelMap.has(target)) {
                    // ラベルで指定されたジャンプ
                    targetLine = labelMap.get(target);
                }
                else {
                    throw new Error(`ラベル ${target} が見つかりません`);
                }
                PC = targetLine;
                nowread = targetLine - 1;
            }
            else {
                PC += 1;
            }
            break;
        case "JNZ":
            if (args.length !== 1)
                throw new Error("JNZ命令は引数1つ必須");
            target = args[0];
            if (!Zeroflag) {
                if (/^\d+$/.test(target)) {
                    // 数字で指定されたジャンプ
                    targetLine = parseInt(target);
                }
                else if (labelMap.has(target)) {
                    // ラベルで指定されたジャンプ
                    targetLine = labelMap.get(target);
                }
                else {
                    throw new Error(`ラベル ${target} が見つかりません`);
                }
                PC = targetLine;
                nowread = targetLine - 1;
            }
            else {
                PC += 1;
            }
            break;
        // 他の命令もここでcaseを追加して処理する
        case "CMP":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 2)
                throw new Error("CMP命令は引数2つ必須");
            val = getValue(args[0]);
            // キャリーフラグ
            if (val < getValue(args[1])) {
                Carryflag = true;
            }
            val -= getValue(args[1]);
            // ゼロフラグ
            if ((val & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            PC += 1;
            break;
        case "OUT":
            if (args.length !== 2)
                throw new Error("OUT命令は引数2つ必須");
            // 出力先
            val = getValue(args[0]);
            accessedouts.add(val);
            output[val] = getValue(args[1]);
            break;
        // CALL
        case "CALL":
            if (args.length !== 1)
                throw new Error("CALL命令は引数1つ必須");
            target = args[0];
            if (/^\d+$/.test(target)) {
                // 数字で指定されたジャンプ
                targetLine = parseInt(target);
            }
            else if (labelMap.has(target)) {
                // ラベルで指定されたジャンプ
                targetLine = labelMap.get(target);
            }
            else {
                throw new Error(`ラベル ${target} が見つかりません`);
            }
            PC = targetLine;
            nowread = targetLine;
            stack.push(targetLine);
            break;
        case "RET":
            if (args.length !== 0)
                throw new Error("RET命令は引数0つ必須");
            const ret = stack.pop();
            if (ret === undefined) {
                throw new Error("スタックアンダーフロー");
            }
            targetLine = ret;
            PC = targetLine;
            nowread = targetLine;
            break;
        // 描画関数x,y,色を指定
        case "DRAW":
            if (args.length !== 3)
                throw new Error("RET命令は引数3つ必須");
            let x = getValue(args[0]);
            let y = getValue(args[1]);
            let start = VRAM_START + (x <= 15 ? 0 : 1) + y * 2;
            accessedMemory.add(start);
            if (x <= 15) {
                x = x;
            }
            else {
                x = x - 16;
            }
            let Rewrite = memory[start];
            if (getValue(args[2]) != 0) {
                Rewrite = Rewrite | 1 << (15 - x);
            }
            else {
                Rewrite = Rewrite & (0xFFFF ^ 1 << (15 - x));
            }
            memory[start] = Rewrite;
            break;
        //INC,DEC
        case "INC":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 1)
                throw new Error("INC命令は引数1つ必須");
            val = getValue(args[0]);
            // オーバーフロー
            if (val + 1 > 0xFFFF) {
                Carryflag = true;
            }
            val += 1;
            // ゼロフラグ
            if ((val & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[0], val);
            PC += 1;
            break;
        case "DEC":
            Carryflag = false;
            Zeroflag = false;
            if (args.length !== 1)
                throw new Error("DEC命令は引数3つ必須");
            val = getValue(args[0]);
            // キャリーフラグ
            if (val < 1) {
                Carryflag = true;
            }
            val -= 1;
            // ゼロフラグ
            if ((val & 0xFFFF) == 0) {
                Zeroflag = true;
            }
            setValue(args[0], val);
            PC += 1;
            break;
        case "NOP":
            PC += 1;
            break;
        default:
            throw new Error(`未対応命令: ${mnemonic}`);
    }
}
function clocks() {
    var _a;
    // all移行
    VRAM_START = parseInt(VRAMstrat.value);
    accessedallMemory = union(new Set(accessedMemory3), accessedallRegister);
    accessedallRegister = union(new Set(accessedMemory3), accessedallRegister);
    accessedallout = union(new Set(accessedouts3), accessedallout);
    // 移る2
    accessedMemory3 = new Set(accessedMemory2);
    accessedRegisters3 = new Set(accessedRegisters2);
    accessedouts3 = new Set(accessedouts2);
    // 移る
    accessedMemory2 = new Set(accessedMemory);
    accessedRegisters2 = new Set(accessedRegisters);
    accessedouts2 = new Set(accessedouts);
    // 変更
    accessedRegisters.clear();
    accessedMemory.clear();
    accessedouts.clear();
    //移る
    inputBox.readOnly = true;
    const value = inputBox.value;
    const linevalue = value.split(/\r?\n/);
    // ラベル
    for (let i = 0; i < linevalue.length; i++) {
        const line = linevalue[i].trim();
        if (line.endsWith(':')) {
            const label = line.slice(0, -1);
            labelMap.set(label, i);
        }
    }
    const nowvalue = linevalue[nowread];
    const parts = nowvalue.split(/ (.+)/);
    const nowmnemonicop = parts[0];
    const nowmnemonicargs = ((_a = parts[1]) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
    if (nowvalue.trim().endsWith(":")) {
        nowread += 1;
    }
    else {
        executeInstruction(nowmnemonicop, nowmnemonicargs, linevalue);
        nowread += 1;
    }
    display();
}
button.addEventListener("click", () => {
    clocks();
});
clockBtn.addEventListener("click", () => {
    if (intervalId === null) {
        // タイマーが動いていないので開始
        intervalId = setInterval(() => {
            clocks();
        }, Math.floor(1000 / parseFloat(clock_speed.value)));
        clockBtn.textContent = "停止";
    }
    else {
        // タイマーが動いていたら停止
        clearInterval(intervalId);
        intervalId = null;
        clockBtn.textContent = "開始";
    }
});
