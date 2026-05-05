// Elementos
const picker = document.getElementById("colorPicker");
const sphere = document.getElementById("sphere");
const shadow = document.getElementById("colorshadow");

// posição da luz
let lightX = 0.5;
let lightY = 0.2;

// Utilidades de cor
function setColor(id, color){
    const el = document.getElementById(id);
    if(el) el.style.background = color;
}

function hexToHSL(H) {
    let r = parseInt(H.substring(1,3),16)/255;
    let g = parseInt(H.substring(3,5),16)/255;
    let b = parseInt(H.substring(5,7),16)/255;

    let max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;

    if(max === min){
        h = s = 0;
    } else {
        let d = max - min;
        s = l > 0.5 ? d/(2-max-min) : d/(max+min);

        switch(max){
            case r: h=(g-b)/d+(g<b?6:0); break;
            case g: h=(b-r)/d+2; break;
            case b: h=(r-g)/d+4; break;
        }
        h *= 60;
    }

    return {h,s,l};
}

function HSLToHex(c){
    let h=c.h/360, s=c.s, l=c.l;
    let r,g,b;

    if(s === 0){
        r = g = b = l;
    } else {
        const hue2rgb = (p,q,t)=>{
            if(t<0) t+=1;
            if(t>1) t-=1;
            if(t<1/6) return p+(q-p)*6*t;
            if(t<1/2) return q;
            if(t<2/3) return p+(q-p)*(2/3-t)*6;
            return p;
        }

        let q = l < 0.5 ? l*(1+s) : l+s-l*s;
        let p = 2*l - q;

        r = hue2rgb(p,q,h+1/3);
        g = hue2rgb(p,q,h);
        b = hue2rgb(p,q,h-1/3);
    }

    const toHex = x => {
        const hex = Math.round(x*255).toString(16);
        return hex.length === 1 ? "0"+hex : hex;
    }

    return "#" + toHex(r) + toHex(g) + toHex(b);
}

// Gerador de paleta
function makeHighlight(c){
    return {
        h: c.h - 12,
        s: c.s * 0.9,
        l: Math.min(1, c.l + 0.22)
    }
}

function makeShadow(c){
    return {
        h: c.h + 18,
        s: Math.min(1, c.s * 1.1),
        l: Math.max(0, c.l - 0.22)
    }
}

function makeDeepShadow(c){
    return {
        h: c.h + 28,
        s: Math.min(1, c.s * 1.2),
        l: Math.max(0, c.l - 0.40)
    }
}

function getPaletteColors(hex){
    const hsl = hexToHSL(hex);

    return {
        highlight: HSLToHex(makeHighlight(hsl)),
        base: hex,
        shadow: HSLToHex(makeShadow(hsl)),
        deepShadow: HSLToHex(makeDeepShadow(hsl))
    };
}

// Render da esfera
function updateSphere(colors){

    const lightPosX = lightX * 100;
    const lightPosY = lightY * 100;

    sphere.style.background =
        "radial-gradient(circle at " +
        lightPosX + "% " + lightPosY + "%, " +
        colors.highlight + " 0%, " +
        colors.base + " 35%, " +
        colors.shadow + " 75%, " +
        colors.deepShadow + " 89%)";

    // sombra no chão
    const shadowOffsetX = (lightX - 0.5) * -120;
    const shadowOffsetY = (lightY - 0.5) * -60;

    shadow.style.transform =
        "translate(" + shadowOffsetX + "px," + shadowOffsetY + "px) scale(1.2)";

    shadow.style.opacity = 0.4 + (lightY * 0.4);
}

function updateAll(){
    const hex = picker.value;
    const colors = getPaletteColors(hex);

    // paleta
    setColor("highlight", colors.highlight);
    setColor("base", colors.base);
    setColor("paletteshadow", colors.shadow);
    setColor("deepShadow", colors.deepShadow);

    // esfera
    updateSphere(colors);
}

// Eventos
picker.addEventListener("input", updateAll);

document.addEventListener("mousemove", function (e) {
    lightX = e.clientX / window.innerWidth;
    lightY = e.clientY / window.innerHeight;
    updateAll();
});

// init
updateAll();