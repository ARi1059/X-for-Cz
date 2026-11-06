const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const main=await figma.getNodeByIdAsync('33:120');
const actions=main.findOne(n=>n.name==='Draft actions');actions.visible=false;mutatedNodeIds.push(actions.id);
const I=await figma.getNodeByIdAsync('28:2'),B=await figma.getNodeByIdAsync('27:14');
const form=box(main,'Change password',700,'VERTICAL',16,24,'surface');radius(form,12);text(form,'修改密码','heading','text',652);caption(form,'修改或重置凭据后，原会话失效。',652);
for(const label of ['当前密码','新密码','再次输入新密码']){const f=instance(form,I,652,label);override(f,label,'Field label');override(f,'••••••••','Value');const c=f.findOne(x=>x.name==='Control');c.resize(652,48);c.children[0].resize(628,22);for(const t of f.children.filter(x=>x.type==='TEXT'))t.resize(652,t.height)}
const change=instance(form,B,300,'Change password action');override(change,'保存新密码');
caption(form,'不使用公开默认密码；部署侧重置凭据。退出与到期后重新登录，成年声明不授予管理员权限。',652);
const preview=await figma.getNodeByIdAsync('33:154');
const publicFrame=await figma.getNodeByIdAsync('29:4');
const clone=track(publicFrame.clone());for(const d of clone.findAll(()=>true))createdNodeIds.push(d.id);preview.appendChild(clone);clone.name='Draft preview · same layout as public';clone.layoutPositioning='ABSOLUTE';clone.x=525;clone.y=160;
for(const id of Object.values({"Admin/Login":"32:2","Admin/LoginMobile":"32:20","Admin/LoginError":"32:38","Admin/LoginLimited":"32:59","Admin/SessionExpired":"32:80"})){const f=await figma.getNodeByIdAsync(id);const form=f.children.find(n=>n.name==='Login form');const reveal=box(form,'Password visibility action',form.width,'HORIZONTAL',0,0);reveal.resize(form.width,44);reveal.primaryAxisSizingMode='FIXED';reveal.counterAxisAlignItems='CENTER';text(reveal,'显示／隐藏密码','caption','accent');form.insertChild(5,reveal);if(f.width===390)form.y=80;mutatedNodeIds.push(form.id)}
return {createdNodeIds,mutatedNodeIds,passwordAction:change.id,previewClone:clone.id};
