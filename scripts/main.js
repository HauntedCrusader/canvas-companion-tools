// Estado global

const state = {
    lightX:        0.5,
    lightY:        0.2,
    intensity:     0.55,  // 0.1 (suave) → 1.0 (extremo)
    lightColor:    0,     // -1 (frio/azul) → 0 (neutro) → +1 (quente/laranja)
};

// Referências DOM

const DOM = {
    picker:           document.getElementById("colorPicker"),
    material:         document.getElementById("material"),
    sphere:           document.getElementById("sphere"),
    shadow:           document.getElementById("colorshadow"),
    toast:            document.getElementById("toast"),
    intensitySlider:  document.getElementById("intensitySlider"),
    intensityVal:     document.getElementById("intensityVal"),
    lightColorSlider: document.getElementById("lightColorSlider"),
    lightColorVal:    document.getElementById("lightColorVal"),
};



// MÓDULO: Conversão de cor
// Pipeline: sRGB hex ↔ Linear RGB ↔ OKLab ↔ OKLCH
// Referência: https://bottosson.github.io/posts/oklab/

const Color = (() => {

    // sRGB ↔ Linear

    function srgbToLinear(v) {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    function linearToSrgb(v) {
        const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        return Math.round(Math.max(0, Math.min(1, encoded)) * 255);
    }

    // Hex → OKLCH

    function hexToOKLCH(hex) {
        const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
        const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
        const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));

        const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
        const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
        const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);

        const L  =  0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
        const a  =  1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
        const bv =  0.0259040371*l + 0.7827717662*m - 0.8086757660*s;

        return {
            L,
            C: Math.sqrt(a*a + bv*bv),
            H: (Math.atan2(bv, a) * 180 / Math.PI + 360) % 360,
        };
    }

    // OKLab → Linear RGB

    function okLabToLinearRGB(L, a, bv) {
        const l = L + 0.3963377774*a + 0.2158037573*bv;
        const m = L - 0.1055613458*a - 0.0638541728*bv;
        const s = L - 0.0894841775*a - 1.2914855480*bv;
        const l3 = l*l*l, m3 = m*m*m, s3 = s*s*s;
        return [
             4.0767416621*l3 - 3.3077115913*m3 + 0.2309699292*s3,
            -1.2684380046*l3 + 2.6097574011*m3 - 0.3413193965*s3,
            -0.0041960863*l3 - 0.7034186147*m3 + 1.7076147010*s3,
        ];
    }

    // Gamut mapping (CSS Color Level 4)
    // Reduz croma C via busca binária até caber no sRGB,
    // preservando matiz H e luminosidade L intactos.

    function isInSRGBGamut(L, a, bv, eps = 0.0002) {
        const [r, g, b] = okLabToLinearRGB(L, a, bv);
        return r >= -eps && r <= 1+eps && g >= -eps && g <= 1+eps && b >= -eps && b <= 1+eps;
    }

    function mapToGamut({ L, C, H }) {
        if (C < 0.0001) return { L, C: 0, H };
        const hRad = H * Math.PI / 180;
        if (isInSRGBGamut(L, C * Math.cos(hRad), C * Math.sin(hRad))) return { L, C, H };
        let lo = 0, hi = C;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            isInSRGBGamut(L, mid * Math.cos(hRad), mid * Math.sin(hRad)) ? lo = mid : hi = mid;
        }
        return { L, C: lo, H };
    }

    // OKLCH → Hex

    function oklchToHex({ L, C, H }) {
        const { L: Lm, C: Cm, H: Hm } = mapToGamut({ L, C, H });
        const hRad = Hm * Math.PI / 180;
        const [r, g, b] = okLabToLinearRGB(Lm, Cm * Math.cos(hRad), Cm * Math.sin(hRad));
        const ch = n => linearToSrgb(n).toString(16).padStart(2, '0');
        return '#' + ch(r) + ch(g) + ch(b);
    }

    // Hex ↔ HSL

    function hexToHSL(hex) {
        const r = parseInt(hex.slice(1,3), 16) / 255;
        const g = parseInt(hex.slice(3,5), 16) / 255;
        const b = parseInt(hex.slice(5,7), 16) / 255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
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

    function hslToHex({ h, s, l }) {
        if (s === 0) {
            const v = Math.round(l * 255).toString(16).padStart(2, '0');
            return '#' + v + v + v;
        }
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q-p)*6*t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q-p)*(2/3-t)*6;
            return p;
        };
        const hn = h / 360;
        const q = l < 0.5 ? l*(1+s) : l+s-l*s;
        const p = 2*l - q;
        const ch = n => Math.round(hue2rgb(p, q, n) * 255).toString(16).padStart(2, '0');
        return '#' + ch(hn+1/3) + ch(hn) + ch(hn-1/3);
    }

    // API pública

    return {
        hexToOKLCH, oklchToHex, hexToHSL, hslToHex,

        shiftHue(hex, degrees) {
            const o = hexToOKLCH(hex);
            return oklchToHex({ ...o, H: (o.H + degrees + 360) % 360 });
        },

        adjustLightness(hex, delta) {
            const o = hexToOKLCH(hex);
            return oklchToHex({ ...o, L: Math.max(0, Math.min(1, o.L + delta)) });
        },

        adjustChroma(hex, factor) {
            const o = hexToOKLCH(hex);
            return oklchToHex({ ...o, C: Math.max(0, o.C * factor) });
        },
    };

})();



// MÓDULO: Luz & Sombra
// Calcula highlight, sombra e sombra profunda a partir de:
//   intensity   — controla o spread de luminosidade (0.1 suave → 1.0 extremo)
//   lightColor  — temperatura da luz (-1 frio/azul → 0 neutro → +1 quente/laranja)
//
// A temperatura é implementada em OKLCH: luz fria desloca H para ~220° (azul-ciano)
// e luz quente desloca H para ~50° (âmbar). A sombra recebe o deslocamento oposto.

const LightShadow = (() => {

    // Matiz alvo para luz fria (ciano-azul) e quente (âmbar-laranja) em OKLCH
    const COLD_HUE  = 220;
    const WARM_HUE  = 55;

    // Quanto o matiz da luz/sombra deriva em direção à temperatura escolhida
    const HUE_STRENGTH    = 30;  // graus máximos de desvio no highlight
    const SHADOW_STRENGTH = 20;  // graus máximos de desvio na sombra (sentido oposto)

    function temperatureHueShift(baseH, lightColor) {
        // Interpola entre o matiz base e o matiz alvo de temperatura
        const targetHue = lightColor > 0 ? WARM_HUE : COLD_HUE;
        const strength  = Math.abs(lightColor) * HUE_STRENGTH;

        // Calcula a diferença angular mais curta
        let diff = ((targetHue - baseH) % 360 + 540) % 360 - 180;
        return diff * (strength / 180);
    }

    function build(hex) {
        const oklch = Color.hexToOKLCH(hex);
        const { L, C, H } = oklch;

        const intensity   = state.intensity;
        const lightColor  = state.lightColor;

        // Spread de luminosidade controlado pela intensidade
        const highlightDL =  intensity * 0.38;   // clareia o highlight
        const shadowDL    = -intensity * 0.28;   // escurece a sombra
        const deepDL      = -intensity * 0.48;   // escurece ainda mais

        // Desvio de matiz pela temperatura da luz
        const highlightDH =  temperatureHueShift(H, lightColor);
        // Sombra recebe temperatura complementar (lei física: sombra quente → luz fria)
        const shadowDH    = -temperatureHueShift(H, lightColor) * (SHADOW_STRENGTH / HUE_STRENGTH);

        // Saturação: luz dessatura levemente, sombra satura levemente
        const highlightDC = C * (-0.08 * intensity);
        const shadowDC    = C * ( 0.12 * intensity);

        const highlight = Color.oklchToHex({
            L: Math.min(0.98, L + highlightDL),
            C: Math.max(0, C + highlightDC),
            H: (H + highlightDH + 360) % 360,
        });

        const shadow = Color.oklchToHex({
            L: Math.max(0.02, L + shadowDL),
            C: Math.min(0.4,  C + shadowDC),
            H: (H + shadowDH  + 360) % 360,
        });

        const deepShadow = Color.oklchToHex({
            L: Math.max(0.02, L + deepDL),
            C: Math.min(0.4,  C + shadowDC * 1.5),
            H: (H + shadowDH * 1.4 + 360) % 360,
        });

        return [
            { hex: highlight,  name: "Luz" },
            { hex: hex,         name: "Base" },
            { hex: shadow,      name: "Sombra" },
            { hex: deepShadow,  name: "Sombra Profunda" },
        ];
    }

    return { build };

})();



// MÓDULO: Paletas de cor

const Palettes = (() => {

    function complementary(hex) {
        const comp = Color.shiftHue(hex, 180);
        return [
            { hex: hex,  name: "Base" },
            { hex: comp, name: "Complementar" },
        ];
    }

    function analogous(hex) {
        return [
            { hex: Color.shiftHue(hex, -40), name: "−40°" },
            { hex: Color.shiftHue(hex, -20), name: "−20°" },
            { hex: hex,                       name: "Base" },
            { hex: Color.shiftHue(hex,  20), name: "+20°" },
            { hex: Color.shiftHue(hex,  40), name: "+40°" },
        ];
    }

    function monochromatic(hex) {
        const o = Color.hexToOKLCH(hex);
        const at = L => Color.oklchToHex({ ...o, L });
        return [
            { hex: at(0.90), name: "Muito Clara" },
            { hex: at(0.72), name: "Clara" },
            { hex: hex,       name: "Base" },
            { hex: at(0.38), name: "Escura" },
            { hex: at(0.20), name: "Muito Escura" },
        ];
    }

    function triadic(hex) {
        return [
            { hex: hex,                       name: "Primária" },
            { hex: Color.shiftHue(hex, 120), name: "Triádica 1" },
            { hex: Color.shiftHue(hex, 240), name: "Triádica 2" },
        ];
    }

    function rule6310(hex) {
        const o = Color.hexToOKLCH(hex);

        const secondary = Color.oklchToHex({
            L: Math.min(0.75, o.L + 0.10),
            C: o.C * 0.70,
            H: (o.H + 30 + 360) % 360,
        });

        const accent = Color.oklchToHex({
            L: o.L,
            C: Math.min(o.C * 1.1, 0.32),
            H: (o.H + 180) % 360,
        });

        return [
            { hex: hex,       name: "60% Dominante", pct: 60 },
            { hex: secondary, name: "30% Secundária", pct: 30 },
            { hex: accent,    name: "10% Destaque",   pct: 10 },
        ];
    }

    return { complementary, analogous, monochromatic, triadic, rule6310 };

})();



// MÓDULO: UI

const UI = (() => {

    let toastTimer = null;

    // Toast

    function showToast(msg) {
        DOM.toast.textContent = msg;
        DOM.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => DOM.toast.classList.remove("show"), 2000);
    }

    function copyHex(hex) {
        const fallback = () => {
            const el = Object.assign(document.createElement("textarea"), { value: hex });
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            el.remove();
        };
        (navigator.clipboard?.writeText(hex) ?? Promise.reject())
            .catch(fallback)
            .finally(() => showToast(`${hex} copiado!`));
    }

    // Color card

    function createCard({ hex, name }) {
        const card = document.createElement("div");
        card.className = "color-card";

        const box = document.createElement("div");
        box.className = "box";
        box.style.background = hex;
        box.title = `Clique para copiar ${hex}`;
        box.addEventListener("click", () => copyHex(hex));

        const nameEl = document.createElement("span");
        nameEl.className = "color-name";
        nameEl.textContent = name;

        const hexEl = document.createElement("span");
        hexEl.className = "hex-label";
        hexEl.textContent = hex;

        card.append(box, nameEl, hexEl);
        return card;
    }

    // Paletas dinâmicas

    function renderPalette(containerId, colors) {
        const container = document.getElementById(containerId);
        container.replaceChildren(...colors.map(createCard));
    }

    // Paleta Luz & Sombra

    function renderLightShadow(hex) {
        const colors = LightShadow.build(hex);
        const ids    = ["highlight", "base", "paletteshadow", "deepShadow"];
        ids.forEach((id, i) => {
            const box   = document.getElementById(id);
            const label = document.getElementById(`${id}-hex`);
            if (box) {
                box.style.background = colors[i].hex;
                box.title = `Clique para copiar ${colors[i].hex}`;
                box.onclick = () => copyHex(colors[i].hex);
            }
            if (label) label.textContent = colors[i].hex;
        });
    }

    // Esfera

    const MATERIALS = {
        metal: (c, x, y) => `
            radial-gradient(circle at ${x}% ${y}%,
                rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 8%, transparent 20%),
            radial-gradient(circle at ${x}% ${y}%,
                ${c.highlight} 0%, ${c.base} 25%, ${c.shadow} 60%, ${c.deep} 100%),
            linear-gradient(-60deg, ${c.highlight}, ${c.shadow}, ${c.highlight}, ${c.deep})`,

        rough: (c, x, y) => `
            radial-gradient(circle at ${x}% ${y}%,
                ${c.highlight}, ${c.base}, ${c.shadow}, ${c.deep}),
            repeating-radial-gradient(circle,
                rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 2px, transparent 3px)`,

        fabric: (c, x, y) => `
            radial-gradient(circle at ${x}% ${y}%,
                ${c.highlight}, ${c.base}, ${c.shadow}),
            repeating-linear-gradient(45deg,
                rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 2px, transparent 2px, transparent 4px)`,

        plastic: (c, x, y) => `
            radial-gradient(circle at ${x}% ${y}%,
                rgba(255,255,255,0.8) 0%, transparent 20%),
            radial-gradient(circle at ${x}% ${y}%,
                ${c.highlight}, ${c.base}, ${c.shadow}, ${c.deep})`,
    };

    function renderSphere(hex) {
        const ls = LightShadow.build(hex);
        const colors = {
            highlight: ls[0].hex,
            base:      ls[1].hex,
            shadow:    ls[2].hex,
            deep:      ls[3].hex,
        };

        const x = state.lightX * 100, y = state.lightY * 100;
        DOM.sphere.style.background = (MATERIALS[DOM.material.value] ?? MATERIALS.plastic)(colors, x, y);
        DOM.shadow.style.transform  = `translate(${(state.lightX - 0.5) * -120}px, ${(state.lightY - 0.5) * -60}px) scale(1.2)`;
        DOM.shadow.style.opacity    = 0.4 + state.lightY * 0.4;
    }

    // Regra 60-30-10

    function renderRule6310(hex) {
        const colors   = Palettes.rule6310(hex);
        const segments = ["rule631-60", "rule631-30", "rule631-10"];
        segments.forEach((id, i) => {
            const el = document.getElementById(id);
            if (el) el.style.background = colors[i].hex;
        });

        const container = document.getElementById("palette-631");
        container.replaceChildren(...colors.map(c => {
            const card = document.createElement("div");
            card.className = "color-card";

            const box = document.createElement("div");
            box.className = "box box--631";
            box.style.background = c.hex;
            box.style.height = `${c.pct * 1.4}px`;
            box.title = `Clique para copiar ${c.hex}`;
            box.addEventListener("click", () => copyHex(c.hex));

            const nameEl = document.createElement("span");
            nameEl.className = "color-name";
            nameEl.textContent = c.name;

            const hexEl = document.createElement("span");
            hexEl.className = "hex-label";
            hexEl.textContent = c.hex;

            card.append(box, nameEl, hexEl);
            return card;
        }));
    }

    // Update completo

    function updateAll() {
        const hex = DOM.picker.value;
        renderSphere(hex);
        renderLightShadow(hex);
        renderPalette("palette-complementary", Palettes.complementary(hex));
        renderPalette("palette-analogous",     Palettes.analogous(hex));
        renderPalette("palette-monochromatic", Palettes.monochromatic(hex));
        renderPalette("palette-triadic",       Palettes.triadic(hex));
        renderRule6310(hex);
    }

    return { updateAll, renderSphere };

})();



// Eventos

DOM.picker.addEventListener("input", UI.updateAll);
DOM.material.addEventListener("change", UI.updateAll);

DOM.intensitySlider.addEventListener("input", e => {
    state.intensity = parseFloat(e.target.value);
    DOM.intensityVal.textContent = state.intensity.toFixed(2);
    UI.updateAll();
});

DOM.lightColorSlider.addEventListener("input", e => {
    state.lightColor = parseFloat(e.target.value);
    const v = state.lightColor;
    DOM.lightColorVal.textContent = v === 0 ? "neutro"
        : v > 0 ? `quente ${(v * 100).toFixed(0)}%`
                : `frio ${(Math.abs(v) * 100).toFixed(0)}%`;
    UI.updateAll();
});

document.addEventListener("mousemove", e => {
    state.lightX = e.clientX / window.innerWidth;
    state.lightY = e.clientY / window.innerHeight;
    UI.renderSphere(DOM.picker.value);
});

// Init
UI.updateAll();