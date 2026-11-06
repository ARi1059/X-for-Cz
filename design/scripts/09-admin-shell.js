const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const P=await figma.getNodeByIdAsync('27:14'),B=await figma.getNodeByIdAsync('27:26'),I=await figma.getNodeByIdAsync('28:2');
function field(p,w,label,value){const n=instance(p,I,w,label);override(n,value,'Value');override(n,label,'Field label');const c=n.findOne(x=>x.name==='Control');c.resize(w,48);c.children[0].resize(w-24,22);for(const t of n.children.filter(x=>x.type==='TEXT'))t.resize(w,t.height);return n}
const screens={},areas={},actions={},tabs={};
for(const [i,[name,w,h]] of [['Admin/Content',1440,2100],['Admin/Links',1440,1500],['Admin/Photos',1440,1250],['Admin/Account',1440,1100],['Admin/ContentMobile',390,1580],['Admin/Preview',1440,1250]].entries()){
const f=artboard(page,name,w,h,100+i*1550,1500);screens[name]=f.id;
if(name==='Admin/Preview'){const p=box(f,'Preview header',w,'HORIZONTAL',16,20,'surface');p.resize(w,96);p.primaryAxisSizingMode='FIXED';p.counterAxisAlignItems='CENTER';text(p,'管理员预览 · 草稿仅当前管理员可见','heading','text',800);const back=instance(p,B,180,'Back to editor');override(back,'返回编辑');actions[name]={back:back.id};continue}
const main=box(f,'Editor main',w===390?350:1040,'VERTICAL',24,0);main.layoutPositioning='ABSOLUTE';main.x=w===390?20:320;main.y=40;areas[name]=main.id;
if(w!==390){
const side=box(f,'Sidebar',240,'VERTICAL',16,24,'surface');side.layoutPositioning='ABSOLUTE';side.x=24;side.y=24;radius(side,16);text(side,'顾清棠','heading','accent',192);caption(side,'名称暂定 · 管理员后台',192);tabs[name]={};
for(const [key,label] of [['Admin/Content','基础与公开文案'],['Admin/Links','五个导航入口'],['Admin/Photos','头像与照片'],['Admin/Account','账号与会话']]){
const t=instance(side,B,192,'Tab '+key);override(t,label);tabs[name][key]=t.id;
}
const logout=instance(side,B,192,'Logout');override(logout,'退出登录');actions[name]={logout:logout.id};
}
text(main,w===390?'内容管理':{'Admin/Content':'基础与公开文案','Admin/Links':'五个导航入口','Admin/Photos':'头像与照片','Admin/Account':'账号与会话'}[name],'title','text',main.width);
caption(main,'草稿 · 尚有待配置字段；公开站点继续使用上次成功发布版本。',main.width);
const bar=box(main,'Draft actions',main.width,w===390?'VERTICAL':'HORIZONTAL',12,0);
const save=instance(bar,B,w===390?350:200,'Save draft');override(save,'保存草稿');
const preview=instance(bar,B,w===390?350:200,'Preview');override(preview,'预览草稿');
const publish=instance(bar,P,w===390?350:200,'Publish');override(publish,'检查并发布');actions[name]={...actions[name],save:save.id,preview:preview.id,publish:publish.id};
}
for(const name of ['Admin/Content','Admin/ContentMobile']){
const main=await figma.getNodeByIdAsync(areas[name]);const w=main.width;const section=box(main,'Basic content fields',w,'VERTICAL',12,24,'surface');radius(section,12);const fw=w-48;
text(section,'基础信息','heading','text',fw);
field(section,fw,'站点名称','顾清棠');caption(section,'暂定；成年确认页、主页和预览共享此值。',fw);
field(section,fw,'短简介','{{SITE_TAGLINE}}');field(section,fw,'补充说明','{{SITE_DESCRIPTION}}');
if(name==='Admin/ContentMobile'){caption(section,'其他编辑分组：成年确认、五入口、照片、分享信息与页脚。移动端纵向堆叠，操作固定可达。',fw);continue}
const age=box(main,'Age and footer configuration',w,'VERTICAL',12,24,'surface');radius(age,12);text(age,'成年确认与页脚','heading','text',fw);
for(const [label,value] of [['成年标题／提示','{{AGE_TITLE}} / {{AGE_NOTICE}}'],['确认／离开按钮文案','{{AGE_CONFIRM_LABEL}} / {{AGE_EXIT_LABEL}}'],['离开目标','待配置；未配置时停留退出提示'],['联系与内容移除说明','{{CONTACT_EMAIL}} / {{REMOVAL_NOTICE}}'],['页脚／更新／重置入口','{{FOOTER_NOTICE}} / {{UPDATE_TEXT}} / {{RESET_AGE_LABEL}}'],['页面标题与描述','{{META_TITLE}} / {{META_DESCRIPTION}}']])field(age,fw,label,value);
caption(age,'确认按钮必须明确表达本人已满18岁；离开保持可用。分享图中性，未确认前不加载主页照片。',fw);
}
return {createdNodeIds,adminFrames:screens,adminAreas:areas,adminActions:actions,adminTabs:tabs};
