const mt = document.getElementById("main-text");

const FPS = 24;
const MIN_LINE_LEN = 7;
const MAX_LINE_LEN = 20;
const MIN_DIST = 4;
const MAX_DIST = 15;
const PROB = 10;
const USE_IMG = true;
const USE_COLOR = true;

const rawGradient = [
	["W", "g", "D", "H", "6", "S", "Z", "2", "F", "{", "[", ")", "c", "&gt;", "!", ",", " "],
	["@", "Q", "K", "A", "b", "E", "5", "y", "J", "4", "r", "i", "?", "+", "~", ".", " "],
	["$", "0", "d", "&amp;", "p", "h", "e", "1", "s", "]", "t", "7", "/", ";", "\"", "'", " "],
	["%", "#", "w", "G", "U", "P", "I", "C", "Y", "j", "T", "(", "&lt;", "^", "_", ".", " "]
];

const colors = [
	"#000000", "#AA0000", "#00AA00", "#AA5500",
	"#0000AA", "#AA00AA", "#00AAAA", "#AAAAAA",
	"#555555", "#FF5555", "#55FF55", "#FFFF55",
	"#5555FF", "#FF55FF", "#55FFFF", "#FFFFFF"
];
const rgbColors = colors.map(hex => [
	parseInt(hex.slice(1, 3), 16),
	parseInt(hex.slice(3, 5), 16),
	parseInt(hex.slice(5, 7), 16)
]);

const canvas = document.createElement("canvas");
canvas.setAttribute("aria-hidden", "true");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
mt.replaceChildren(canvas);
const ctx = canvas.getContext("2d", { alpha: false });

let columns = 0;
let rows = 0;
let charWidth = 0;
let lineHeight = 0;
let bc_grid = [];
let symbol_colors = [];
let symbols = [];
let displayedColors = [];
let lines = [];
let background = "#000000";
let font = "16px monospace";
let ready = false;
let generation = 0;
const interval = 1000 / FPS;
let lastTime = 0;

const img = new Image();
img.src = "src/img/img.jpg";

function randint(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function closestColor(r, g, b) {
	let closest = 0;
	let minDistance = Infinity;
	for (let i = 0; i < rgbColors.length; i++) {
		const [cr, cg, cb] = rgbColors[i];
		const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
		if (distance < minDistance) {
			minDistance = distance;
			closest = i;
		}
	}
	return closest;
}

async function processImage(width, height) {
	if (!USE_IMG) return {
		brightness: Array.from({ length: height }, () => Array(width).fill(0)),
		pixelColors: Array.from({ length: height }, () => Array(width).fill(colors[2]))
	};
	await img.decode();
	const offscreen = document.createElement("canvas");
	offscreen.width = width;
	offscreen.height = height;
	const imageCtx = offscreen.getContext("2d", { willReadFrequently: true });
	imageCtx.drawImage(img, 0, 0, width, height);
	const data = imageCtx.getImageData(0, 0, width, height).data;
	const brightness = Array.from({ length: height }, () => Array(width).fill(0));
	const pixelColors = Array.from({ length: height }, () => Array(width).fill("#FFFFFF"));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const r = data[i], g = data[i + 1], b = data[i + 2];
			const lum = Math.pow((r + g + b) / 3 / 255, 2.2);
			brightness[y][x] = gradient[0].length - 1 - Math.round(lum * (gradient[0].length - 1));
			pixelColors[y][x] = colors[closestColor(r, g, b)];
		}
	}
	return { brightness, pixelColors };
}

function paintCell(x, y, ch, color) {
	if (symbols[y][x] === ch && displayedColors[y][x] === color) return;
	symbols[y][x] = ch;
	displayedColors[y][x] = color;
	const px = x * charWidth;
	const py = y * lineHeight;
	ctx.fillStyle = background;
	ctx.fillRect(px, py, charWidth, lineHeight);
	if (ch !== " ") {
		ctx.fillStyle = color;
		ctx.fillText(ch, px, py);
	}
}

function wrap_sym(x, y, active) {
	let ch = " ";
	let color = colors[2];
	if (active) {
		if (USE_IMG) {
			ch = gradient[randint(0, gradient.length - 1)][bc_grid[y][x]];
			color = symbol_colors[y][x];
		} else {
			ch = gradient[randint(0, gradient.length - 1)][randint(0, gradient[0].length - 2)];
		}
	}
	paintCell(x, y, ch, USE_COLOR ? color : colors[2]);
}

async function update_size() {
	const token = ++generation;
	ready = false;
	const style = getComputedStyle(mt);
	const fontSize = parseFloat(style.fontSize) || 16;
	lineHeight = parseFloat(style.lineHeight) || fontSize;
	font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
	background = style.backgroundColor === "rgba(0, 0, 0, 0)" ? "#000000" : style.backgroundColor;

	ctx.font = font;
	charWidth = ctx.measureText("M").width;
	const newColumns = Math.floor(mt.clientWidth / charWidth);
	const newRows = Math.floor(mt.clientHeight / lineHeight);
	if (!Number.isFinite(newColumns) || !Number.isFinite(newRows) || newColumns < 1 || newRows < 1) return;

	let imageData;
	try {
		imageData = await processImage(newColumns, newRows);
	} catch (err) {
		console.error("Failed to load image:", err);
		return;
	}
	if (token !== generation) return;

	columns = newColumns;
	rows = newRows;
	bc_grid = imageData.brightness;
	symbol_colors = imageData.pixelColors;
	symbols = Array.from({ length: rows }, () => Array(columns).fill(" "));
	displayedColors = Array.from({ length: rows }, () => Array(columns).fill(colors[2]));
	lines = Array.from({ length: columns }, () => []);
	for (let i = 0; i < columns; i++) {
		if (randint(0, PROB) === 0) lines[i].push([0, randint(MIN_LINE_LEN, MAX_LINE_LEN)]);
	}

	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.round(mt.clientWidth * dpr);
	canvas.height = Math.round(mt.clientHeight * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.font = font;
	ctx.textBaseline = "top";
	ctx.fillStyle = background;
	ctx.fillRect(0, 0, mt.clientWidth, mt.clientHeight);
	ready = true;
}

function update(time) {
	if (ready && time - lastTime >= interval) {
		lastTime = time;
		for (let i = 0; i < columns; i++) {
			lines[i].forEach(el => {
				if (el[0] < rows - 1) wrap_sym(i, el[0], true);
				if (el[0] - el[1] >= 0 && el[0] - el[1] < rows - 1) {
					wrap_sym(i, el[0] - el[1], false);
				}
				el[0] += 1;
			});
			if (lines[i].length === 0) {
				if (randint(0, PROB) === 0) lines[i].push([0, randint(MIN_LINE_LEN, MAX_LINE_LEN)]);
			} else {
				const first = lines[i][0];
				if (first[0] - first[1] > MIN_DIST) {
					if (randint(0, PROB) === 0) lines[i].push([0, randint(MIN_LINE_LEN, MAX_LINE_LEN)]);
				} else if (first[0] - first[1] > MAX_DIST) {
					lines[i].push([0, randint(MIN_LINE_LEN, MAX_LINE_LEN)]);
				}
				const last = lines[i][lines[i].length - 1];
				if (last[0] - last[1] > rows) lines[i].shift();
			}
		}
	}
	requestAnimationFrame(update);
}

window.addEventListener("resize", () => { void update_size(); });
window.addEventListener("DOMContentLoaded", async () => {
	await document.fonts.ready;
	await update_size();
	requestAnimationFrame(update);
});
