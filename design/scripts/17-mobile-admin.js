const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const P=await figma.getNodeByIdAsync('27:14'),B=await figma.getNodeByIdAsync('27:26'),I=await figma.getNodeByIdAsync('28:2');
function field(p,label,value){const f=instance(p,I,350,label);override(f,label,'Field label');override(f,value,'Value');return f}
const screens={},links={},acts={};
for(const [i,[name,title,h]] of [['Admin/LinksMobile','五个导航入口',1600],['Admin/PhotosMobile','头像与照片',1600],['Admin/AccountMobile','账号与会话',1100]].entries()){
const f=artboard(page,name,390,h,100+i*450,3900);screens[name]=f.id;
const main=box(f,'Mobile editor',350,'VERTICAL',20,0);main.layoutPositioning='ABSOLUTE';main.x=20;main.y=32;
text(main,title,'title','text',350);const navrow=box(main,'Mobile sections',350,'HORIZONTAL',8,0);links[name]={};
for(const [key,label] of [['Admin/ContentMobile','基础'],['Admin/LinksMobile','入口'],['Admin/PhotosMobile','照片']]){const b=instance(navrow,B,110,'Mobile tab '+key);override(b,label);links[name][key]=b.id}
if(name==='Admin/LinksMobile'){for(const [key,label] of [['x_profile','X主页'],['tg_personal','Telegram个人账号'],['tg_preview','Telegram预览频道'],['onlyfans','OnlyFans主页'],['membership','会员购买入口']]){
const card=box(main,key,350,'VERTICAL',8,16,'surface');radius(card,12);text(card,label,'label','text',318);caption(card,key+' · 待配置 / 禁用',318);}
field(main,'显示文字','{{TG_PREVIEW_LABEL}}');field(main,'目标地址','待配置');caption(main,'辅助说明、排序、显示与唯一强调项采用同一纵向编辑模式。',350);
}else if(name==='Admin/PhotosMobile'){const view=box(main,'Mobile gallery viewport',350,'HORIZONTAL',8,0);view.resize(350,160);view.primaryAxisSizingMode='FIXED';view.counterAxisSizingMode='FIXED';view.clipsContent=true;view.overflowDirection='HORIZONTAL';
for(const [i,id] of ['26:79','26:80','26:81','26:82','26:83','26:84'].entries()){const src=await figma.getNodeByIdAsync(id);const p=rect(view,i===0?'Avatar':'Photo '+i,128,160);p.fills=src.fills}
override(instance(main,B,350),'上传／替换照片');field(main,'照片说明','{{PHOTO_CAPTION}}');field(main,'替代文本','{{PHOTO_ALT}}');field(main,'裁切焦点','X 50% · Y 50%');override(instance(main,B,350),'排序／隐藏／删除');caption(main,'手机表单纵向堆叠；确认删除使用中的图片。',350);
}else{for(const label of ['当前密码','新密码','再次输入新密码'])field(main,label,'••••••••');caption(main,'修改后旧会话失效；退出后重新登录。',350)}
const save=instance(main,P,350,'Mobile save');override(save,name==='Admin/AccountMobile'?'保存新密码':'保存草稿');
const preview=instance(main,B,350,'Mobile preview');override(preview,name==='Admin/AccountMobile'?'退出登录':'预览草稿');acts[name]={save:save.id,preview:preview.id};
}
const basic=await figma.getNodeByIdAsync('33:144');
const nr=box(basic,'Mobile sections',350,'HORIZONTAL',8,0);basic.insertChild(2,nr);links['Admin/ContentMobile']={};
for(const [key,label] of [['Admin/ContentMobile','基础'],['Admin/LinksMobile','入口'],['Admin/PhotosMobile','照片']]){const b=instance(nr,B,110,'Mobile tab '+key);override(b,label);links['Admin/ContentMobile'][key]=b.id}
return {createdNodeIds,mobileAdminFrames:screens,mobileAdminTabs:links,mobileAdminActions:acts};
