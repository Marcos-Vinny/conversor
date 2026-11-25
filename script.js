const IMAGE_TYPES = {
"image/png": "PNG",
"image/jpeg": "JPEG",
"image/webp": "WEBP",
"image/bmp": "BMP",
"image/gif": "GIF"
};

const OUTPUTS = {
PDF: ["PNG", "JPEG", "WEBP", "GIF"],
PNG: ["JPEG", "WEBP", "GIF", "PDF"],
JPEG: ["PNG", "WEBP", "GIF", "PDF"],
WEBP: ["PNG", "JPEG", "GIF", "PDF"],
BMP: ["PNG", "JPEG", "WEBP", "GIF", "PDF"],
GIF: ["PNG", "JPEG", "WEBP", "PDF"]
};

const MIME = { PNG: "image/png", JPEG: "image/jpeg", WEBP: "image/webp" };
const EXT = { PNG: "png", JPEG: "jpg", WEBP: "webp", GIF: "gif", PDF: "pdf" };

const GIF_LIB = "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/";
let gifWorkerUrl = null;

const fileInput = document.getElementById("file");
const drop = document.getElementById("drop");
const dropTitle = document.getElementById("dropTitle");
const panel = document.getElementById("panel");
const fileName = document.getElementById("fileName");
const fileType = document.getElementById("fileType");
const target = document.getElementById("target");
const quality = document.getElementById("quality");
const qualityOut = document.getElementById("qualityOut");
const qualityRow = document.getElementById("qualityRow");
const convertBtn = document.getElementById("convert");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");

let currentFile = null;
let currentType = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function detectType(file) {
if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "PDF";
if (IMAGE_TYPES[file.type]) return IMAGE_TYPES[file.type];
const ext = (file.name.split(".").pop() || "").toLowerCase();
if (ext === "jpg" || ext === "jpeg") return "JPEG";
const found = Object.values(IMAGE_TYPES).find(t => t.toLowerCase() === ext);
return found || null;
}

function setStatus(text, isError) {
statusEl.textContent = text;
statusEl.classList.toggle("error", Boolean(isError));
}

function updateQualityVisibility() {
const lossy = target.value === "JPEG" || target.value === "WEBP";
qualityRow.hidden = !lossy;
}

function handleFile(file) {
if (!file) return;
const type = detectType(file);
results.innerHTML = "";
if (!type) {
panel.hidden = false;
fileName.textContent = file.name;
fileType.textContent = "Não suportado";
target.innerHTML = "";
convertBtn.disabled = true;
setStatus("Este tipo de arquivo não é suportado.", true);
return;
}
currentFile = file;
currentType = type;
fileName.textContent = file.name;
fileType.textContent = type;
dropTitle.textContent = "Trocar arquivo";
target.innerHTML = OUTPUTS[type].map(t => `<option value="${t}">${t}</option>`).join("");
convertBtn.disabled = false;
panel.hidden = false;
setStatus("");
updateQualityVisibility();
}

function baseName() {
return currentFile.name.replace(/\.[^.]+$/, "");
}

async function getGifWorkerUrl() {
if (gifWorkerUrl) return gifWorkerUrl;
const res = await fetch(GIF_LIB + "gif.worker.js");
const code = await res.text();
gifWorkerUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
return gifWorkerUrl;
}

async function canvasToGif(canvas) {
const workerScript = await getGifWorkerUrl();
return new Promise((resolve, reject) => {
const gif = new GIF({ workers: 2, quality: 5, width: canvas.width, height: canvas.height, workerScript });
gif.on("finished", resolve);
gif.on("abort", () => reject(new Error("Falha ao gerar o GIF.")));
gif.addFrame(canvas, { copy: true });
gif.render();
});
}

function canvasToBlob(canvas, format) {
if (format === "GIF") return canvasToGif(canvas);
return new Promise((resolve, reject) => {
const q = Number(quality.value) / 100;
canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem.")), MIME[format], q);
});
}

function loadImage(file) {
return new Promise((resolve, reject) => {
const url = URL.createObjectURL(file);
const img = new Image();
img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler a imagem.")); };
img.src = url;
});
}

function imageToCanvas(img, flatten) {
const canvas = document.createElement("canvas");
canvas.width = img.naturalWidth;
canvas.height = img.naturalHeight;
const ctx = canvas.getContext("2d");
if (flatten) {
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);
}
ctx.drawImage(img, 0, 0);
return canvas;
}

function addResult(blob, name, preview) {
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = name;
if (preview) {
const img = document.createElement("img");
img.src = url;
img.alt = name;
a.appendChild(img);
} else {
const icon = document.createElement("div");
icon.className = "pdf-icon";
icon.textContent = "PDF";
a.appendChild(icon);
}
const label = document.createElement("span");
label.textContent = name;
a.appendChild(label);
results.appendChild(a);
return a;
}

function triggerDownload(a) {
a.click();
}

async function imageToImage(format) {
const img = await loadImage(currentFile);
const canvas = imageToCanvas(img, format === "JPEG" || format === "GIF");
const blob = await canvasToBlob(canvas, format);
const link = addResult(blob, `${baseName()}.${EXT[format]}`, true);
triggerDownload(link);
}

async function imageToPdf() {
const img = await loadImage(currentFile);
const canvas = imageToCanvas(img, true);
const data = canvas.toDataURL("image/jpeg", Number(quality.value) / 100);
const { jsPDF } = window.jspdf;
const orientation = canvas.width >= canvas.height ? "l" : "p";
const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
pdf.addImage(data, "JPEG", 0, 0, canvas.width, canvas.height);
const blob = pdf.output("blob");
const link = addResult(blob, `${baseName()}.pdf`, false);
triggerDownload(link);
}

async function pdfToImages(format) {
const buffer = await currentFile.arrayBuffer();
const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
for (let i = 1; i <= pdf.numPages; i++) {
setStatus(`Convertendo página ${i} de ${pdf.numPages}...`);
const page = await pdf.getPage(i);
const viewport = page.getViewport({ scale: 2 });
const canvas = document.createElement("canvas");
canvas.width = viewport.width;
canvas.height = viewport.height;
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, viewport }).promise;
const blob = await canvasToBlob(canvas, format);
const name = pdf.numPages > 1 ? `${baseName()}-${i}.${EXT[format]}` : `${baseName()}.${EXT[format]}`;
addResult(blob, name, true);
}
}

async function convert() {
if (!currentFile) return;
const format = target.value;
results.innerHTML = "";
convertBtn.disabled = true;
setStatus("Convertendo...");
try {
if (currentType === "PDF") {
await pdfToImages(format);
} else if (format === "PDF") {
await imageToPdf();
} else {
await imageToImage(format);
}
setStatus("Pronto. Toque em um arquivo para baixar.");
} catch (err) {
setStatus(err.message || "Erro na conversão.", true);
} finally {
convertBtn.disabled = false;
}
}

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
target.addEventListener("change", updateQualityVisibility);
quality.addEventListener("input", () => { qualityOut.textContent = `${quality.value}%`; });
convertBtn.addEventListener("click", convert);

["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => {
e.preventDefault();
drop.classList.add("over");
}));

["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => {
e.preventDefault();
drop.classList.remove("over");
}));

drop.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));