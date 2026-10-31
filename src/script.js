const mt = document.getElementById("main-text");

const FPS = 24;
let MIN_LINE_LEN = 7;
let MAX_LINE_LEN = 20;
let MIN_DIST = 4;
let MAX_DIST = 15;
let PROB = 10;
let USE_IMG = true;
let USE_COLOR = true;

let mainColor = "#00AA00";
let headColor = "#FFFFFF";
let imageActive = false;
let imagePath = "";
let paused = false;

const rawGradient = [
	["W", "g", "D", "H", "6", "S", "Z", "2", "F", "{", "[", ")", "c", "&gt;", "!", ",", " "],
	["@", "Q", "K", "A", "b", "E", "5", "y", "J", "4", "r", "i", "?", "+", "~", ".", " "],
	["$", "0", "d", "&amp;", "p", "h", "e", "1", "s", "]", "t", "7", "/", ";", "\"", "'", " "],
	["%", "#", "w", "G", "U", "P", "I", "C", "Y", "j", "T", "(", "&lt;", "^", "_", ".", " "]
];

// Decode the HTML entities from the original DOM character palette for Canvas.
const decoder = document.createElement("textarea");
const gradient = rawGradient.map(row => row.map(ch => {
	decoder.innerHTML = ch;
	return decoder.value;
}));

const colors = [
	"#000000", "#AA0000", "#00AA00", "#AA5500",
	"#0000AA", "#AA00AA", "#00AAAA", "#AAAAAA",
	"#555555", "#FF5555", "#55FF55", "#FFFF55",
	"#5555FF", "#FF55FF", "#55FFFF", "#FFFFFF"
];
let rgbColors = colors.map(hex => [
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
let interval = 1000 / FPS;
let lastTime = 0;

function randint(min, max) {
	if (min > max) [min, max] = [max, min];
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

function emptyImage(width, height) {
	return {
		brightness: Array.from({ length: height }, () => Array(width).fill(0)),
		pixelColors: Array.from({ length: height }, () => Array(width).fill(mainColor)),
		active: false
	};
}

// Keep already encoded URLs intact; encode only raw filesystem paths.
function imageURL(value) {
	let path = String(value || "").replace(/\\/g, "/");
	// WE can supply an encoded drive path (C%3A/...). Decode that input once
	// before detecting the drive and encoding the actual filesystem path.
	// Raw paths are left alone: a literal %20 in a filename must stay literal.
	if (/^[a-z]%3a(?:\/|%2f|%5c)/i.test(path)) {
		try {
			path = decodeURIComponent(path).replace(/\\/g, "/");
		} catch (err) {
			console.warn("Invalid encoded image path:", path, err);
		}
	}
	if (!path) return "";
	if (/^(file:|https?:|data:|blob:)/i.test(path)) return path;
	const encoded = path.split("/").map(part => encodeURIComponent(part)).join("/");
	if (/^[a-z]:\//i.test(path)) return "file:///" + encoded.replace(/^([a-z])%3A/i, "$1:");
	if (path.startsWith("//")) return "file:" + encoded;
	if (path.startsWith("/")) return "file://" + encoded;
	return encoded; // Project-relative file, e.g. an image imported by the editor.
}

function loadImage(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not load image: " + src));
		img.src = src;
	});
}

let imageNotice;
function showImageError(message) {
	if (!imageNotice) {
		imageNotice = document.createElement("div");
		imageNotice.style.cssText = "position:fixed;bottom:16px;left:16px;right:16px;padding:12px;background:#160b0bee;color:#fff;font:14px monospace;z-index:10;white-space:pre-wrap;overflow-wrap:anywhere";
		document.body.appendChild(imageNotice);
	}
	imageNotice.textContent = message;
	imageNotice.hidden = !message;
}

async function processImage(width, height) {
	if (!USE_IMG || !imagePath) return emptyImage(width, height);
	const img = await loadImage(imagePath);
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
	return { brightness, pixelColors, active: true };
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

function wrap_sym(x, y, active, head = false) {
	let ch = " ";
	let color = mainColor;
	if (active) {
		if (imageActive) {
			ch = gradient[randint(0, gradient.length - 1)][bc_grid[y][x]];
			color = symbol_colors[y][x];
		} else {
			ch = gradient[randint(0, gradient.length - 1)][randint(0, gradient[0].length - 2)];
		}
	}
	paintCell(x, y, ch, (!imageActive || !USE_COLOR) && head ? headColor : (USE_COLOR ? color : mainColor));
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
	let imageError = "";
	try {
		imageData = await processImage(newColumns, newRows);
	} catch (err) {
		console.warn("Failed to load image; using classic rain:", err);
		imageError = "Image error: " + err.message;
		imageData = emptyImage(newColumns, newRows);
	}
	if (token !== generation) return;
	showImageError(imageError);

	imageActive = imageData.active;
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
	if (ready && !paused && time - lastTime >= interval) {
		lastTime = time;
		for (let i = 0; i < columns; i++) {
			lines[i].forEach(el => {
				// The previous bright head becomes an ordinary body character.
				if ((!imageActive || !USE_COLOR) && el[0] > 0 && el[0] - 1 < rows) {
					paintCell(i, el[0] - 1, symbols[el[0] - 1][i], mainColor);
				}
				if (el[0] < rows) wrap_sym(i, el[0], true, true);
				if (el[0] - el[1] >= 0 && el[0] - el[1] < rows) {
					wrap_sym(i, el[0] - el[1], false);
				}
				el[0] += 1;
			});
			if (lines[i].length === 0) {
				if (randint(0, PROB) === 0) lines[i].push([0, randint(MIN_LINE_LEN, MAX_LINE_LEN)]);
			} else {
				const newest = lines[i][lines[i].length - 1];
				const gap = newest[0] - newest[1];
				if (gap > MAX_DIST || (gap > MIN_DIST && randint(0, PROB) === 0)) {
					lines[i].push([0, randint(MIN_LINE_LEN, MAX_LINE_LEN)]);
				}
				if (lines[i][0][0] - lines[i][0][1] > rows) lines[i].shift();
			}
		}
	}
	requestAnimationFrame(update);
}

// Wallpaper Engine sends only changed properties after the initial full update.
function propertyColor(value) {
	const rgb = String(value).trim().split(/\s+/).map(Number);
	if (rgb.length !== 3 || !rgb.every(Number.isFinite)) return null;
	return "#" + rgb.map(c => Math.round(Math.max(0, Math.min(1, c)) * 255)
		.toString(16).padStart(2, "0")).join("");
}

function propertyNumber(property, fallback, min, max) {
	const value = Number(property?.value);
	return property && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

window.wallpaperPropertyListener = {
	applyUserProperties(properties) {
		const root = document.documentElement;
		if (properties.fontsize) root.style.setProperty("--font-size", propertyNumber(properties.fontsize, 12, 6, 64) + "px");
		MIN_LINE_LEN = propertyNumber(properties.minlength, MIN_LINE_LEN, 1, 200);
		MAX_LINE_LEN = propertyNumber(properties.maxlength, MAX_LINE_LEN, 1, 200);
		// Keep both slider values independent; randint normalizes reversed bounds.
		if (properties.density) {
			const scale = 50 / propertyNumber(properties.density, 50, 1, 100);
			MIN_DIST = Math.max(1, Math.round(4 * scale));
			MAX_DIST = Math.max(MIN_DIST, Math.round(15 * scale));
			PROB = Math.max(0, Math.round(11 * scale) - 1);
		}
		if (properties.useimg) USE_IMG = !!properties.useimg.value;
		if (properties.usecolor) USE_COLOR = !!properties.usecolor.value;
		if (properties.maincolor) mainColor = propertyColor(properties.maincolor.value) || mainColor;
		if (properties.headcolor) headColor = propertyColor(properties.headcolor.value) || headColor;
		if (properties.backgroundcolor) {
			const color = propertyColor(properties.backgroundcolor.value);
			if (color) root.style.setProperty("--bg-color", color);
		}
		if (properties.image) {
			imagePath = imageURL(properties.image.value);
		}
		for (let i = 0; i < colors.length; i++) {
			if (properties["palette" + i]) colors[i] = propertyColor(properties["palette" + i].value) || colors[i];
		}
		rgbColors = colors.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
		void update_size();
	},
	applyGeneralProperties(properties) {
		if (properties.fps) interval = 1000 / Math.min(FPS, Math.max(1, properties.fps));
	},
	setPaused(value) { paused = value; }
};

// Replay values received while the deferred main script was loading.
if (window.walpPendingProperties) {
	window.wallpaperPropertyListener.applyUserProperties(window.walpPendingProperties);
	delete window.walpPendingProperties;
}

window.addEventListener("resize", () => { void update_size(); });
window.addEventListener("DOMContentLoaded", async () => {
	await document.fonts.ready;
	await update_size();
	requestAnimationFrame(update);
});
