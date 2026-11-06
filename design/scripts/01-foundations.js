await figma.loadFontAsync({family:'Noto Sans SC',style:'Regular'});
await figma.loadFontAsync({family:'Noto Sans SC',style:'Medium'});
const page=await figma.getNodeByIdAsync('25:2'); await figma.setCurrentPageAsync(page);
const before=new Set(page.findAll(()=>true).map(n=>n.id));
const collections=await figma.variables.getLocalVariableCollectionsAsync();
function collection(name){let c=collections.find(v=>v.name===name); if(!c){c=figma.variables.createVariableCollection(name);c.renameMode(c.modes[0].modeId,'墨黑香槟')}return c}
const primitive=collection('M1 · 原始值'),semantic=collection('M1 · 风格01');
const vals={bg:'#171615',surface:'#282725',hover:'#35322F',pressed:'#211F1D',text:'#F3EEE4',muted:'#B9B3AA',accent:'#C7A678',border:'#676158',error:'#E8AAA4',success:'#B8C9A9'};
const ids={},createdVariableIds=[];
function variable(name,c,type,value,scopes){const v=figma.variables.createVariable(name,c,type);v.scopes=scopes;v.setValueForMode(c.modes[0].modeId,value);v.setVariableCodeSyntax('WEB','var(--'+name.replaceAll('/','-').toLowerCase()+')');createdVariableIds.push(v.id);return v}
function rgb(hex){return {r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255,a:1}}
for(const [name,value] of Object.entries(vals)){const p=variable('M1/raw/'+name,primitive,'COLOR',rgb(value),[]);const v=variable('M1/color/'+name,semantic,'COLOR',{type:'VARIABLE_ALIAS',id:p.id},['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR']);ids[name]=v.id}
for(const value of [0,2,4,8,12,16,20,24,28,32,40,48,56,64,80]){const v=variable('M1/space/'+value,semantic,'FLOAT',value,['GAP']);ids['space/'+value]=v.id}
for(const value of [4,8,12,16,28,999]){const v=variable('M1/radius/'+value,semantic,'FLOAT',value,['CORNER_RADIUS']);ids['radius/'+value]=v.id}
const styles={};
for(const [name,size,line,weight] of [['title',28,40,'Medium'],['heading',20,30,'Medium'],['body',14,22,'Regular'],['label',14,22,'Medium'],['caption',12,18,'Regular']]){const s=figma.createTextStyle();s.name='M1/'+name;s.fontName={family:'Noto Sans SC',style:weight};s.fontSize=size;s.lineHeight={unit:'PIXELS',value:line};styles[name]=s.id}
function p(key){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',figma.variables.getVariableById(ids[key]))}
const board=figma.createAutoLayout('VERTICAL');board.name='M1 / 封面与基础规范';board.resize(1200,1000);board.x=100;board.y=100;board.paddingTop=48;board.paddingBottom=48;board.paddingLeft=48;board.paddingRight=48;board.itemSpacing=24;board.fills=[p('bg')];
function text(value,size=14,color='text'){const n=figma.createText();n.fontName={family:'Noto Sans SC',style:'Regular'};n.fontSize=size;n.lineHeight={unit:'PIXELS',value:size*1.5};n.characters=value;n.fills=[p(color)];board.appendChild(n);n.resize(1080,n.height);n.textAutoResize='HEIGHT';return n}
text('顾清棠  /  风格01 · 墨黑香槟',28);
text('M1 可编辑设计交付 · 2026.10.29\n设计稿完成后待用户确认；应用功能与部署在后续阶段实施。',14,'muted');
text('小头像 → 名称／简介 → 五个统一纵向按钮 → 轻量照片条 → 页脚',20);
const row=figma.createAutoLayout('HORIZONTAL');row.name='Color tokens';row.itemSpacing=16;row.fills=[];board.appendChild(row);
for(const [name,value] of Object.entries(vals).slice(0,7)){const cell=figma.createAutoLayout('VERTICAL');cell.name=name;cell.itemSpacing=8;cell.fills=[];row.appendChild(cell);const sw=figma.createRectangle();sw.name=value;sw.resize(132,72);sw.fills=[p(name)];cell.appendChild(sw);const t=figma.createText();t.fontName={family:'Noto Sans SC',style:'Regular'};t.fontSize=12;t.characters=name+'\n'+value;t.fills=[p('text')];cell.appendChild(t)}
text('字体  Noto Sans SC · Regular / Medium\n28 / 20 / 14 / 12 px；中文优先，系统字体作为实现回退。',20);
text('布局  手机 360 / 390 px：左右 20 px，按钮 56 px 高，间距 12 px\n桌面 1440 px：居中内容宽 600 px；触控区域至少 44 px。',14,'muted');
text('名称仅显示「顾清棠」；暂定状态写入管理说明。其他公开文案和链接继续占位。\n初始链接全部禁用；照片固定在五入口之后。成年确认前无头像、照片和主页外链数据。',14,'muted');
const images={};
return {createdNodeIds:page.findAll(()=>true).filter(n=>!before.has(n.id)).map(n=>n.id),collections:{primitive:primitive.id,semantic:semantic.id},variables:ids,textStyles:styles,createdVariableIds,foundationBoard:board.id};
