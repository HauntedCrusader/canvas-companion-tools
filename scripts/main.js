// Elementos principais
const picker = document.getElementById("colorPicker");
const materialSelect = document.getElementById("material");
const sphere = document.getElementById("sphere");
const shadow = document.getElementById("colorshadow");
const toast = document.getElementById("toast");

let lightX = 0.5;
let lightY = 0.2;
let toastTimer = null;

// Controles de temperatura da paleta Luz & Sombra
let hueShift = 1.0;   // multiplicador do desvio de matiz (0 = sem desvio, 2 = dobro)
let satShift = 1.0;   // multiplicador da saturação nas sombras/luzes

// Utilitários de cor

function hexToHSL(H) {
    let r = parseInt(H.substring(1, 3), 16) / 255;
    let g = parseInt(H.substring(3, 5), 16) / 255;
    let b = parseInt(H.substring(5, 7), 16) / 255;

    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return { h, s, l };
}

function HSLToHex(c) {
    let h = c.h / 360, s = c.s, l = c.l;
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = x => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
}

function shiftHue(hsl, degrees) {
    return { h: ((hsl.h + degrees) % 360 + 360) % 360, s: hsl.s, l: hsl.l };
}

//  Conversão para espaço perceptual OKLCH
// OKLCH é o sucessor do LCH — matiz uniforme e gamut mapping mais preciso.
// Pipeline: sRGB → Linear RGB → OKLab → OKLCH (e volta)

function srgbToLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v) {
    v = Math.max(0, Math.min(1, v));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

function hexToOKLCH(hex) {
    const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
    const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
    const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));

    // Linear RGB → OKLab (via XYZ D65, matrizes Björn Ottosson)
    const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
    const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
    const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);

    const L =  0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
    const a =  1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
    const bv = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s;

    const C = Math.sqrt(a*a + bv*bv);
    const H = (Math.atan2(bv, a) * 180 / Math.PI + 360) % 360;
    return { L, C, H };
}

function OKLCHToHex({ L, C, H }) {
    // OKLCH → OKLab
    const hRad = H * Math.PI / 180;
    const a  = C * Math.cos(hRad);
    const bv = C * Math.sin(hRad);

    // OKLab → Linear RGB
    const l = L + 0.3963377774*a + 0.2158037573*bv;
    const m = L - 0.1055613458*a - 0.0638541728*bv;
    const s = L - 0.0894841775*a - 1.2914855480*bv;

    const l3 = l*l*l, m3 = m*m*m, s3 = s*s*s;

    const r =  4.0767416621*l3 - 3.3077115913*m3 + 0.2309699292*s3;
    const g = -1.2684380046*l3 + 2.6097574011*m3 - 0.3413193965*s3;
    const b = -0.0041960863*l3 - 0.7034186147*m3 + 1.7076147010*s3;

    const toHex = n => linearToSrgb(n).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function shiftLCHHue(hex, degrees) {
    const oklch = hexToOKLCH(hex);
    return OKLCHToHex({ ...oklch, H: (oklch.H + degrees + 360) % 360 });
}

// Paletas

function makeHighlight(c) {
    return { h: ((c.h - 12 * hueShift) % 360 + 360) % 360, s: Math.min(1, c.s * (1 - 0.1 * satShift)), l: Math.min(1, c.l + 0.22) };
}
function makeShadow(c) {
    return { h: ((c.h + 18 * hueShift) % 360 + 360) % 360, s: Math.min(1, c.s * (1 + 0.1 * satShift)), l: Math.max(0, c.l - 0.22) };
}
function makeDeepShadow(c) {
    return { h: ((c.h + 28 * hueShift) % 360 + 360) % 360, s: Math.min(1, c.s * (1 + 0.2 * satShift)), l: Math.max(0, c.l - 0.40) };
}

function getLightShadowPalette(hex) {
    const hsl = hexToHSL(hex);
    return [
        { hex: HSLToHex(makeHighlight(hsl)), name: "Luz" },
        { hex: hex,                          name: "Base" },
        { hex: HSLToHex(makeShadow(hsl)),    name: "Sombra" },
        { hex: HSLToHex(makeDeepShadow(hsl)),name: "Sombra Profunda" },
    ];
}

function getComplementaryPalette(hex) {
    const comp = shiftLCHHue(hex, 180);
    const hslBase = hexToHSL(hex);
    const hslComp = hexToHSL(comp);
    return [
        { hex: HSLToHex({ ...hslBase, l: Math.min(1, hslBase.l + 0.15) }), name: "Base Clara" },
        { hex: hex,  name: "Base" },
        { hex: HSLToHex({ ...hslComp, l: Math.min(1, hslComp.l + 0.15) }), name: "Complementar Clara" },
        { hex: comp, name: "Complementar" },
    ];
}

function getAnalogousPalette(hex) {
    return [
        { hex: shiftLCHHue(hex, -40), name: "-40°" },
        { hex: shiftLCHHue(hex, -20), name: "-20°" },
        { hex: hex,                    name: "Base" },
        { hex: shiftLCHHue(hex,  20), name: "+20°" },
        { hex: shiftLCHHue(hex,  40), name: "+40°" },
    ];
}

function getMonochromaticPalette(hex) {
    const hsl = hexToHSL(hex);
    return [
        { hex: HSLToHex({ ...hsl, l: 0.85 }), name: "Muito Clara" },
        { hex: HSLToHex({ ...hsl, l: 0.65 }), name: "Clara" },
        { hex: hex,                             name: "Base" },
        { hex: HSLToHex({ ...hsl, l: 0.30 }), name: "Escura" },
        { hex: HSLToHex({ ...hsl, l: 0.12 }), name: "Muito Escura" },
    ];
}

function getTriadicPalette(hex) {
    return [
        { hex: hex,                    name: "Primária" },
        { hex: shiftLCHHue(hex, 120), name: "Triádica 1" },
        { hex: shiftLCHHue(hex, 240), name: "Triádica 2" },
    ];
}

// Copiar cor

function copyHex(hex) {
    navigator.clipboard.writeText(hex).then(() => {
        showToast(hex + " copiado!");
    }).catch(() => {
        // Fallback para ambientes sem clipboard API
        const el = document.createElement("textarea");
        el.value = hex;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        showToast(hex + " copiado!");
    });
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

// Render

function createColorCard(color) {
    const card = document.createElement("div");
    card.className = "color-card";

    const box = document.createElement("div");
    box.className = "box";
    box.style.background = color.hex;
    box.title = "Clique para copiar " + color.hex;
    box.addEventListener("click", () => copyHex(color.hex));

    const name = document.createElement("span");
    name.className = "color-name";
    name.textContent = color.name;

    const hexLabel = document.createElement("span");
    hexLabel.className = "hex-label";
    hexLabel.textContent = color.hex;

    card.appendChild(box);
    card.appendChild(name);
    card.appendChild(hexLabel);
    return card;
}

function renderPalette(containerId, colors) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    colors.forEach(color => container.appendChild(createColorCard(color)));
}

function getMaterialBackground(colors, lightPosX, lightPosY) {
    const mat = materialSelect.value;
    switch (mat) {
        case "metal":
            return `
                radial-gradient(circle at ${lightPosX}% ${lightPosY}%,
                    rgba(255,255,255,0.95) 0%,
                    rgba(255,255,255,0.4) 8%,
                    rgba(255,255,255,0.0) 20%),
                radial-gradient(circle at ${lightPosX}% ${lightPosY}%,
                    ${colors.highlight} 0%, ${colors.base} 25%,
                    ${colors.shadow} 60%, ${colors.deepShadow} 100%),
                linear-gradient(-60deg,
                    ${colors.highlight}, ${colors.shadow},
                    ${colors.highlight}, ${colors.deepShadow})`;
        case "rough":
            return `
                radial-gradient(circle at ${lightPosX}% ${lightPosY}%,
                    ${colors.highlight}, ${colors.base},
                    ${colors.shadow}, ${colors.deepShadow}),
                repeating-radial-gradient(circle,
                    rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 2px, transparent 3px)`;
        case "fabric":
            return `
                radial-gradient(circle at ${lightPosX}% ${lightPosY}%,
                    ${colors.highlight}, ${colors.base}, ${colors.shadow}),
                repeating-linear-gradient(45deg,
                    rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 2px,
                    transparent 2px, transparent 4px)`;
        default: // plastic
            return `
                radial-gradient(circle at ${lightPosX}% ${lightPosY}%,
                    rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.0) 20%),
                radial-gradient(circle at ${lightPosX}% ${lightPosY}%,
                    ${colors.highlight}, ${colors.base},
                    ${colors.shadow}, ${colors.deepShadow})`;
    }
}

function updateSphere(hex) {
    const hsl = hexToHSL(hex);
    const colors = {
        highlight: HSLToHex(makeHighlight(hsl)),
        base: hex,
        shadow: HSLToHex(makeShadow(hsl)),
        deepShadow: HSLToHex(makeDeepShadow(hsl)),
    };

    const lightPosX = lightX * 100;
    const lightPosY = lightY * 100;

    sphere.style.background = getMaterialBackground(colors, lightPosX, lightPosY);

    const shadowOffsetX = (lightX - 0.5) * -120;
    const shadowOffsetY = (lightY - 0.5) * -60;
    shadow.style.transform = `translate(${shadowOffsetX}px, ${shadowOffsetY}px) scale(1.2)`;
    shadow.style.opacity = 0.4 + lightY * 0.4;
}

// Atualiza a paleta estática de Luz & Sombra (IDs fixos no HTML)
function updateLightShadowSection(hex) {
    const colors = getLightShadowPalette(hex);
    const ids = ["highlight", "base", "paletteshadow", "deepShadow"];
    ids.forEach((id, i) => {
        const box = document.getElementById(id);
        const label = document.getElementById(id + "-hex");
        if (box) {
            box.style.background = colors[i].hex;
            box.title = "Clique para copiar " + colors[i].hex;
            box.onclick = () => copyHex(colors[i].hex);
        }
        if (label) label.textContent = colors[i].hex;
    });
}

function updateAll() {
    const hex = picker.value;

    // Esfera
    updateSphere(hex);

    // Luz & Sombra (seção estática)
    updateLightShadowSection(hex);

    // Paletas dinâmicas
    renderPalette("palette-complementary", getComplementaryPalette(hex));
    renderPalette("palette-analogous",     getAnalogousPalette(hex));
    renderPalette("palette-monochromatic", getMonochromaticPalette(hex));
    renderPalette("palette-triadic",       getTriadicPalette(hex));
}

// Eventos

picker.addEventListener("input", updateAll);
materialSelect.addEventListener("change", updateAll);

document.getElementById("hueShiftSlider").addEventListener("input", (e) => {
    hueShift = parseFloat(e.target.value);
    document.getElementById("hueShiftVal").textContent = (hueShift >= 0 ? "+" : "") + hueShift.toFixed(1) + "×";
    updateAll();
});

document.getElementById("satShiftSlider").addEventListener("input", (e) => {
    satShift = parseFloat(e.target.value);
    document.getElementById("satShiftVal").textContent = (satShift >= 0 ? "+" : "") + satShift.toFixed(1) + "×";
    updateAll();
});

document.addEventListener("mousemove", (e) => {
    lightX = e.clientX / window.innerWidth;
    lightY = e.clientY / window.innerHeight;
    updateSphere(picker.value);
});

// Init
updateAll();
