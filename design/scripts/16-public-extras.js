const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
const original=await figma.getNodeByIdAsync('29:4');
function copy(name,x){const c=track(original.clone());for(const d of c.findAll(()=>true))createdNodeIds.push(d.id);page.appendChild(c);c.name=name;c.x=x;c.y=4800;return c}
const long=copy('Public/LongText',100);long.resize(390,1180);
const name=long.findOne(n=>n.type==='TEXT'&&n.characters==='顾清棠');name.characters='顾清棠与较长名称的换行示例';name.textAutoResize='HEIGHT';
const bio=long.findOne(n=>n.type==='TEXT'&&n.characters==='{{SITE_TAGLINE}}');bio.characters='{{SITE_TAGLINE}}\n{{SITE_TAGLINE}}\n{{SITE_TAGLINE}}';bio.textAutoResize='HEIGHT';
const second=copy('Public/390-Slide2',550);
const viewport=second.findOne(n=>n.name==='Horizontal swipe viewport');
for(const [i,n] of viewport.children.entries()){n.layoutPositioning='ABSOLUTE';n.x=(i-1)*88;n.y=0;mutatedNodeIds.push(n.id)}
second.findOne(n=>n.type==='TEXT'&&n.characters==='1 / 5').characters='2 / 5';
const hidden=copy('Public/HiddenEntry',1000);const item=hidden.findOne(n=>n.name==='membership'&&n.type==='INSTANCE');item.visible=false;mutatedNodeIds.push(item.id);
const active=copy('Public/ConfiguredStyleExample',1450);const defaultB=await figma.getNodeByIdAsync('27:2'),accentB=await figma.getNodeByIdAsync('27:26');
for(const n of active.findAll(n=>n.type==='INSTANCE')){const t=n.findOne(t=>t.type==='TEXT');const value=t?.characters;n.swapComponent(n.name==='tg_preview'?accentB:defaultB);if(value)override(n,value);mutatedNodeIds.push(n.id)}
note(page,'溢出与配置样式说明','长名称示例支持两行，简介最多三行；实际长度上限在M2约定。隐藏入口从布局与键盘顺序移除。\n最右为配置后样式示意，真实地址仍空，设计原型不连接外部URL；正式初始状态继续禁用。',1200,100,6100);
return {createdNodeIds,mutatedNodeIds,publicExtras:{long:long.id,slide2:second.id,hidden:hidden.id,configured:active.id}};
