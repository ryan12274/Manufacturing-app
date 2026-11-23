export const PART_COLOR_PALETTE=Object.freeze([
 {value:'#000000',label:'Black'},
 {value:'#ffffff',label:'White'},
 {value:'#001489',label:'Blue'},
 {value:'#ffd400',label:'Yellow'}
]);
export const isPartColor=value=>value===''||PART_COLOR_PALETTE.some(c=>c.value===value);
export const partColorName=value=>PART_COLOR_PALETTE.find(c=>c.value===value)?.label||'Not specified';

// Onshape appearance uses integer RGB channels; BOM/custom properties may use hex.
export function partColorHex(value,depth=0){
 if(depth>4||value==null)return '';
 if(typeof value==='string'){
  let hex=value.trim().toLowerCase();
  const named=PART_COLOR_PALETTE.find(c=>c.label.toLowerCase()===hex);if(named)return named.value;
  if(/^#?[0-9a-f]{3}$/.test(hex)){hex=hex.replace(/^#/,'');return '#'+[...hex].map(c=>c+c).join('');}
  if(/^#?[0-9a-f]{6}$/.test(hex))return '#'+hex.replace(/^#/,'');
  return '';
 }
 if(typeof value!=='object'||Array.isArray(value))return '';
 const channels=['red','green','blue'].map((k,n)=>value[k]??value[['r','g','b'][n]]);
 if(channels.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return '#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('');
 for(const key of ['hex','hexColor','color','appearance']){const hex=partColorHex(value[key],depth+1);if(hex)return hex;}
 return '';
}
export function generalizePartColor(value){
 const hex=partColorHex(value);if(!hex)return '';
 const [r,g,b]=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,saturation=max?delta/max:0;
 if(max<0.1)return '#000000';
 if(saturation<0.12||delta<0.06)return (max+min)/2>=0.5?'#ffffff':'#000000';
 let hue=max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4;
 hue=(hue*60+360)%360;
 // Broad hue families deliberately include pale, golden and dark variants.
 if(hue>=30&&hue<=95)return '#ffd400';
 if(hue>=150&&hue<=290)return '#001489';
 const squared=(a,b)=>a.reduce((n,v,i)=>n+(v-b[i])**2,0);
 return [...PART_COLOR_PALETTE].sort((a,c)=>squared([r,g,b],[1,3,5].map(n=>parseInt(a.value.slice(n,n+2),16)/255))-squared([r,g,b],[1,3,5].map(n=>parseInt(c.value.slice(n,n+2),16)/255)))[0].value;
}
export function onshapeAppearanceHex(metadata){
 if(!metadata||typeof metadata!=='object')return '';
 const direct=partColorHex(metadata.appearance)||partColorHex(metadata.color);if(direct)return direct;
 const properties=Array.isArray(metadata.properties)?metadata.properties:[];
 const named=properties.filter(p=>/^(appearance|color|colour)$/i.test(p?.name||''));
 for(const p of [...named,...properties]){const hex=partColorHex(p?.value?.color)||(/^(appearance|color|colour)$/i.test(p?.name||'')?partColorHex(p.value):'');if(hex)return hex;}
 return '';
}
export function partColorDot(value){
 const color=PART_COLOR_PALETTE.find(c=>c.value===value);
 return color?'<span class="part-color-dot" role="img" aria-label="Color: '+color.label+'" title="'+color.label+' · '+color.value+'" style="--part-color:'+color.value+'"></span>':'<span class="part-color-dot color-unavailable" role="img" aria-label="Color not available" title="Color not available"></span>';
}
