const page=await figma.getNodeByIdAsync('25:6');await figma.setCurrentPageAsync(page);
const primary=await figma.getNodeByIdAsync('27:14'),input=await figma.getNodeByIdAsync('28:2');
const loginFrames={},loginActions={};
function field(parent,w,label,value){const n=instance(parent,input,w);n.findOne(x=>x.type==='TEXT'&&x.name==='Field label').characters=label;n.findOne(x=>x.type==='TEXT'&&x.name==='Value').characters=value;const control=n.findOne(x=>x.name==='Control');control.resize(w,48);control.children[0].resize(w-24,22);for(const t of n.children.filter(x=>x.type==='TEXT'))t.resize(w,t.height);return n}
for(const [i,[name,w,h,title,detail]] of [
['Admin/Login',1440,1000,'',''],
['Admin/LoginMobile',390,844,'',''],
['Admin/LoginError',390,844,'登录信息有误','请检查密码后重试。'],
['Admin/LoginLimited',390,844,'尝试次数过多','请稍后重试。具体等待时间由后端返回。'],
['Admin/SessionExpired',390,844,'登录已过期','请重新登录；恢复草稿前先确认当前保存状态。']
].entries()){
const f=artboard(page,name,w,h,100+i*500,100);
if(w===1440)f.x=2800;
const c=box(f,'Login form',w===1440?400:350,'VERTICAL',16,0);c.layoutPositioning='ABSOLUTE';c.x=w===1440?520:20;c.y=w===1440?200:120;
text(c,'顾清棠','heading','accent',c.width);text(c,'管理员登录','title','text',c.width);text(c,'仅管理员维护站点内容。','body','muted',c.width);
field(c,c.width,'管理员账号','待输入');field(c,c.width,'密码','••••••••');
if(title){const b=box(c,'Login feedback',c.width,'VERTICAL',8,12,'surface');radius(b,8);text(b,title,'label','error',c.width-24);caption(b,detail,c.width-24);}
const action=instance(c,primary,c.width,'Sign in');override(action,'登录');
caption(c,'凭据重置由部署侧受控流程处理。',c.width);
loginFrames[name]=f.id;loginActions[name]=action.id;
}
note(page,'登录权限与交互','管理员登录独立于成年声明。Tab依次：账号→密码→显示密码→登录。\n密码可见性按钮触控44px；错误、频率限制、会话到期独立设计。后台凭据重置由部署侧执行。',950,100,1120);
return {createdNodeIds,loginFrames,loginActions};
