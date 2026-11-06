const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
const cols={"Public/360":"29:3","Public/390":"29:5","Public/Desktop":"29:7"};const reset={};const galleries={};
const sourceIds=['26:80','26:81','26:82','26:83','26:84'];const sources=await Promise.all(sourceIds.map(id=>figma.getNodeByIdAsync(id)));
for(const [name,id] of Object.entries(cols)){
const col=await figma.getNodeByIdAsync(id);const w=col.width;
const gallery=box(col,'03 Gallery · after all five links',w,'VERTICAL',8,0);
const viewport=box(gallery,'Horizontal swipe viewport',w,'HORIZONTAL',8,0);viewport.resize(w,100);viewport.primaryAxisSizingMode='FIXED';viewport.clipsContent=true;viewport.overflowDirection='HORIZONTAL';
for(const [i,source] of sources.entries()){const r=rect(viewport,'Photo '+(i+1),80,100,'surface',8);r.fills=source.fills;}
const controls=box(gallery,'Gallery controls · 44px hit area',w,'HORIZONTAL',8,0);controls.resize(w,44);controls.primaryAxisSizingMode='FIXED';controls.counterAxisAlignItems='CENTER';controls.primaryAxisAlignItems='CENTER';
for(const value of ['‹','1 / 5','›']){const c=box(controls,'Control '+value,value.length>1?80:44,'HORIZONTAL',0,0);c.resize(value.length>1?80:44,44);c.primaryAxisSizingMode='FIXED';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';text(c,value,'body','muted')}
const footer=box(col,'04 Footer',w,'VERTICAL',8,0);text(footer,'{{FOOTER_NOTICE}}','caption','muted',w,'CENTER');
text(footer,'{{CONTACT_EMAIL}} · {{REMOVAL_NOTICE}}','caption','muted',w,'CENTER');
text(footer,'{{UPDATE_TEXT}}','caption','muted',w,'CENTER');
const link=box(footer,'Reset age confirmation',w,'HORIZONTAL',0,0);link.resize(w,44);link.primaryAxisSizingMode='FIXED';link.primaryAxisAlignItems='CENTER';link.counterAxisAlignItems='CENTER';text(link,'{{RESET_AGE_LABEL}}','caption','accent');
reset[name]=link.id;galleries[name]=gallery.id;
}
note(page,'照片和页脚标注','五张原图保留色调。手机照片条可横向滑动，左右按钮触控44px；单张隐藏切换，零张隐藏整个模块。\n页脚重置成年声明后返回确认页。可选FAQ默认空；上线由管理员确认文案、图片和链接。',1000,100,1300);
return {createdNodeIds,resetLinks:reset,galleries};
