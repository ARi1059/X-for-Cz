const page=await figma.getNodeByIdAsync('25:4');await figma.setCurrentPageAsync(page);
const inputs=[];const inputMap={};
for(const [i,state] of ['Default','Focus','Error','Disabled','Long'].entries()){
const c=track(figma.createComponent());c.name='State='+state;c.resize(360,104);c.layoutMode='VERTICAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';gap(c,4);c.fills=[];
const label=text(c,'字段名称','label','text',360);label.name='Field label';
const control=box(c,'Control',360,'HORIZONTAL',8,12,'surface');control.resize(360,48);control.primaryAxisSizingMode='FIXED';control.counterAxisAlignItems='CENTER';radius(control,8);stroke(control,state==='Focus'?'accent':state==='Error'?'error':'border',state==='Focus'?2:1);
const value=text(control,state==='Long'?'较长的内容预览，保持单行并可编辑':'待填写','body',state==='Disabled'?'muted':'text',336);value.name='Value';
text(c,state==='Error'?'请检查字段格式，编辑内容已保留。':'帮助提示与字段校验信息','caption',state==='Error'?'error':'muted',360).name='Helper';
for(const [name,n] of [['Field label',label],['Value',value]]){const key=c.addComponentProperty(name,'TEXT',n.characters);n.componentPropertyReferences={characters:key}}
inputs.push(c);inputMap[state]=c.id;}
const set=track(figma.combineAsVariants(inputs,page));set.name='M1/Input';set.description='带标签与帮助信息的字段；输入框高48px。中文系统字体；错误信息与字段关联，焦点可见。';
set.x=100;set.y=180;set.fills=[paint('bg')];set.children.forEach((c,i)=>{c.x=24+i*392;c.y=24});set.resize(2010,156);
const banners=[];const bannerMap={};
for(const [i,state] of ['Info','Success','Error','Warning'].entries()){
const c=track(figma.createComponent());c.name='Tone='+state;c.resize(360,88);c.layoutMode='VERTICAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';pad(c,16);gap(c,4);fill(c,'surface');radius(c,8);stroke(c,state==='Error'?'error':state==='Success'?'success':'accent');
const t=text(c,'状态反馈','label',state==='Error'?'error':state==='Success'?'success':'text',328);t.name='Title';const d=text(c,'结果说明与下一步操作。','caption','muted',328);d.name='Detail';
for(const [name,n] of [['Title',t],['Detail',d]]){const k=c.addComponentProperty(name,'TEXT',n.characters);n.componentPropertyReferences={characters:k}}
banners.push(c);bannerMap[state]=c.id;}
const bs=track(figma.combineAsVariants(banners,page));bs.name='M1/Feedback';bs.description='保存/发布/存储受限/错误反馈；错误保留编辑内容，以文字和描边同时区分。';
bs.x=100;bs.y=440;bs.fills=[paint('bg')];bs.children.forEach((c,i)=>{c.x=24+i*392;c.y=24});bs.resize(1618,136);
text(page,'表单与反馈  /  Editable states','title').set({x:100,y:100});
note(page,'字段与反馈规则','标签保持可见；密码可切换可见性；错误不用颜色单独传达。\n后续实现以aria-describedby关联帮助信息；结果反馈使用适当live区域，不抢走输入焦点。',1000,100,650);
return {createdNodeIds,inputSet:set.id,inputs:inputMap,feedbackSet:bs.id,feedback:bannerMap};
