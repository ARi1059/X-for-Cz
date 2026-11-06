const page=await figma.getNodeByIdAsync('25:3');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='M1/Button'))throw new Error('M1/Button already exists');
const variants=[];const map={};
for(const [ti,tone] of ['Link','Primary','Secondary'].entries()){
 for(const [si,state] of ['Default','Hover','Focus','Pressed','Disabled','Loading'].entries()){
 const c=track(figma.createComponent());c.name='Tone='+tone+', State='+state;c.resize(320,56);c.layoutMode='HORIZONTAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';pad(c,16);gap(c,8);radius(c,28);
 fill(c,tone==='Primary'?'accent':state==='Hover'?'hover':state==='Pressed'?'pressed':'surface');
 if(tone==='Secondary'||state==='Focus')stroke(c,state==='Focus'?'text':'accent',state==='Focus'?2:1);
 const label=text(c,state==='Loading'?'处理中…':'{{X_PROFILE_LABEL}}','label',tone==='Primary'?'bg':state==='Disabled'?'muted':'text',288,'CENTER');label.name='Label';
 const prop=c.addComponentProperty('Label','TEXT',label.characters);label.componentPropertyReferences={characters:prop};
 c.description='风格01操作按钮；高度56px，触控≥44px。Disabled无跳转，Loading防重复提交。公开入口目标为空时使用Disabled。';
 page.appendChild(c);variants.push(c);map[tone+'/'+state]=c.id;
 }}
const set=track(figma.combineAsVariants(variants,page));set.name='M1/Button';set.description='Link用于五入口；Primary用于主操作；Secondary用于次操作。仅一个链接可选轻强调。初始真实URL为空，使用Disabled。';
set.x=100;set.y=180;set.fills=[paint('bg')];
set.children.forEach((c,i)=>{c.x=24+(i%6)*344;c.y=32+Math.floor(i/6)*96;});
set.resize(2088,328);
text(page,'操作组件  /  Link · Primary · Secondary × 6 states','title').set({x:100,y:100});
note(page,'按钮规则','从左至右：默认 / 悬停 / 焦点 / 按下 / 禁用 / 处理中。\n隐藏状态移出公开DOM与键盘顺序，不用透明按钮占位。焦点2px象牙描边；减少动态效果时反馈立即切换。',1100,100,560);
return {createdNodeIds,buttonSet:set.id,buttons:map,checks:{variantCount:set.children.length,minHeight:Math.min(...set.children.map(c=>c.height))}};
