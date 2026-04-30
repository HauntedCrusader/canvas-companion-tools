const picker = document.getElementById("colorPicker");

picker.addEventListener("input", updateColors);
updateColors();

function updateColors(){
    const hex = picker.value;
    const hsl = hexToHSL(hex);

    const highlight = makeHighlight(hsl);
    const shadow = makeShadow(hsl);
    const deepShadow = makeDeepShadow(hsl);

    setColor("highlight", HSLToHex(highlight));
    setColor("base", hex);
    setColor("shadow", HSLToHex(shadow));
    setColor("deepShadow", HSLToHex(deepShadow));
}

function setColor(id,color){
    document.getElementById(id).style.background=color;
}

function hexToHSL(H) {
    let r = 0, g = 0, b = 0;

    r = parseInt(H.substring(1,3),16)/255;
    g = parseInt(H.substring(3,5),16)/255;
    b = parseInt(H.substring(5,7),16)/255;

    let max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;

    if(max==min){
        h=s=0;
    }else{
        let d = max-min;
        s = l>0.5 ? d/(2-max-min) : d/(max+min);

        switch(max){
            case r: h=(g-b)/d+(g<b?6:0); break;
            case g: h=(b-r)/d+2; break;
            case b: h=(r-g)/d+4; break;
        }
        h*=60;
    }

    return {h,s,l};
}

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


function HSLToHex(c){
    let h=c.h,s=c.s,l=c.l;

    h/=360;

    let r,g,b;

    if(s==0){
        r=g=b=l;
    }else{
        const hue2rgb=(p,q,t)=>{
            if(t<0) t+=1;
            if(t>1) t-=1;
            if(t<1/6) return p+(q-p)*6*t;
            if(t<1/2) return q;
            if(t<2/3) return p+(q-p)*(2/3-t)*6;
            return p;
        }

        let q=l<0.5?l*(1+s):l+s-l*s;
        let p=2*l-q;

        r=hue2rgb(p,q,h+1/3);
        g=hue2rgb(p,q,h);
        b=hue2rgb(p,q,h-1/3);
    }

    const toHex=x=>{
        const hex=Math.round(x*255).toString(16);
        return hex.length==1?"0"+hex:hex;
    }

    return "#"+toHex(r)+toHex(g)+toHex(b);
}

