// Public catalog reads only. No Onshape or customer credentials are sent to WCP.
async function wcpJson(url,fetcher){
 let response;try{response=await fetcher(url,{method:'GET',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});}catch(err){console.warn('WCP catalog fetch failed',err.name,err.message);throw Error('WCP catalog connection failed. Try again later.');}
 if(!response.ok)throw Error('WCP could not load this product. Check its link or part number (HTTP '+response.status+').');
 const body=await response.text();if(body.length>2_000_000)throw Error('WCP product response is too large.');try{return JSON.parse(body);}catch{console.warn('WCP catalog non-JSON response',new URL(url).pathname,response.status,response.headers.get('content-type'),body.slice(0,120));throw Error('WCP catalog returned a webpage instead of product data.');}
}
function wcpCatalogProduct(data,handle){
 if(!Array.isArray(data.variants)||data.variants.length>500)throw Error('WCP returned an invalid product.');
 return {title:String(data.title||''),url:'https://wcproducts.com/products/'+handle,variants:data.variants.map(v=>({id:String(v.id),sku:String(v.sku||''),title:String(v.title||''),available:v.available===true}))};
}
export async function wcpProductData(urlString,fetcher=fetch,number=''){
 if(urlString){
  const url=new URL(urlString);if(url.protocol!=='https:'||!['wcproducts.com','www.wcproducts.com'].includes(url.hostname)||url.port||url.username||url.password)throw Error('Use a WCP product link.');
  const match=url.pathname.match(/(?:^|\/)products\/([a-z0-9-]+)\/?$/i);if(!match)throw Error('Use a WCP product page link.');
  return wcpCatalogProduct(await wcpJson('https://wcproducts.com/products/'+match[1]+'.js',fetcher),match[1]);
 }
 const matches=String(number).toUpperCase().match(/\bWCP-\d{4,6}\b/g)||[];
 const skus=[...new Set(matches)];if(skus.length!==1)throw Error('WCP needs one exact WCP part number or a product link. Check the vendor for REV parts.');
 const sku=skus[0],handle=sku.toLowerCase();
 const exact=p=>p.variants.filter(v=>v.sku.toUpperCase()===sku);
 try{const product=wcpCatalogProduct(await wcpJson('https://wcproducts.com/products/'+handle+'.js',fetcher),handle);if(exact(product).length===1)return {...product,number:sku};}catch{}
 // Search results can mention a SKU in a kit description. Verify the variant SKU.
 const search=new URL('https://wcproducts.com/search/suggest.json');search.searchParams.set('q',sku);search.searchParams.set('resources[type]','product');search.searchParams.set('resources[limit]','5');
 const data=await wcpJson(search.href,fetcher);const products=data.resources?.results?.products;
 if(!Array.isArray(products))throw Error('WCP search is unavailable. Try again later.');
 const found=[];
 for(const h of [...new Set(products.slice(0,5).map(p=>p.handle))]){
  if(typeof h!=='string'||!/^([a-z0-9-]+)$/i.test(h)||h===handle)continue;
  try{const p=wcpCatalogProduct(await wcpJson('https://wcproducts.com/products/'+h+'.js',fetcher),h);if(exact(p).length===1)found.push(p);}catch{}
 }
 if(found.length!==1)throw Error('WCP has no unique purchasable match for this SKU. Add a current product link or check for a discontinued part.');
 return {...found[0],number:sku};
}
