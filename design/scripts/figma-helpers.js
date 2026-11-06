await figma.loadFontAsync({family:'Noto Sans SC',style:'Regular'});
await figma.loadFontAsync({family:'Noto Sans SC',style:'Medium'});
const _vars=await figma.variables.getLocalVariablesAsync();
const _styles=await figma.getLocalTextStylesAsync();
const V=Object.fromEntries(_vars.map(v=>[v.name,v]));
const S=Object.fromEntries(_styles.map(s=>[s.name,s]));
const createdNodeIds=[];const mutatedNodeIds=[];
function track(n){createdNodeIds.push(n.id);return n}
function paint(key){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',V['M1/color/'+key])}
function fill(n,key){n.fills=[paint(key)]}
function gap(n,v){n.itemSpacing=v;if(V['M1/space/'+v])n.setBoundVariable('itemSpacing',V['M1/space/'+v])}
function pad(n,v){for(const k of ['paddingTop','paddingBottom','paddingLeft','paddingRight']){n[k]=v;if(V['M1/space/'+v])n.setBoundVariable(k,V['M1/space/'+v])}}
function radius(n,v){n.cornerRadius=v;for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(k,V['M1/radius/'+v])}
function box(parent,name,w,direction='VERTICAL',spacing=12,padding=0,bg=null){const n=track(figma.createAutoLayout(direction));n.name=name;n.resize(w,1);n.primaryAxisSizingMode=direction==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=direction==='HORIZONTAL'?'AUTO':'FIXED';gap(n,spacing);pad(n,padding);n.fills=bg?[paint(bg)]:[];if(parent)parent.appendChild(n);return n}
function text(parent,value,style='body',color='text',width=null,align='LEFT'){const n=track(figma.createText());n.fontName={family:'Noto Sans SC',style:'Regular'};n.characters=value;n.textStyleId=S['M1/'+style].id;n.fills=[paint(color)];n.textAlignHorizontal=align;if(parent)parent.appendChild(n);if(width!==null){n.resize(width,Math.max(n.height,1));n.textAutoResize='HEIGHT'}return n}
function rect(parent,name,w,h,bg='surface',r=12){const n=track(figma.createRectangle());n.name=name;n.resize(w,h);n.fills=[paint(bg)];if(r)radius(n,r);if(parent)parent.appendChild(n);return n}
function stroke(n,key='border',weight=1){n.strokes=[paint(key)];n.strokeWeight=weight}
function instance(parent,comp,w=null,name=null){const n=track(comp.createInstance());for(const d of n.findAll(()=>true))createdNodeIds.push(d.id);if(name)n.name=name;parent.appendChild(n);if(w!==null)n.resize(w,n.height);return n}
function override(n,value,name='Label'){const t=n.findOne(x=>x.type==='TEXT'&&x.name===name);if(t)t.characters=value;return n}
function artboard(page,name,w,h,x,y){const n=box(page,name,w,'VERTICAL',0,0,'bg');n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.clipsContent=true;n.x=x;n.y=y;return n}
function note(page,name,value,w,x,y){const n=box(page,name,w,'VERTICAL',8,16,'surface');radius(n,12);n.x=x;n.y=y;text(n,value,'body','muted',w-32);return n}
async function nav(from,to,trigger='ON_CLICK'){let top=from;while(top.parent&&top.parent.type!=='PAGE')top=top.parent;if(top.id===to.id)return;const a={type:'NODE',destinationId:to.id,navigation:'NAVIGATE',transition:null};await from.setReactionsAsync([{trigger:{type:trigger},action:a,actions:[a]}]);mutatedNodeIds.push(from.id)}
function caption(parent,value,w){return text(parent,value,'caption','muted',w)}
