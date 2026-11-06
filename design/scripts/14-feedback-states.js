const page=await figma.getNodeByIdAsync('25:7');await figma.setCurrentPageAsync(page);
const B=await figma.getNodeByIdAsync('27:26'),P=await figma.getNodeByIdAsync('27:14');
const cases=[
['Saved','草稿已保存','Success','保存成功','公开页仍使用上次发布版本。','继续编辑'],
['SaveError','草稿保存失败','Error','保存失败','保留当前输入，重试后再离开。','重试保存'],
['Publishing','正在发布','Info','发布处理中','防止重复提交；完成前保留旧版本。','返回编辑'],
['Published','发布成功','Success','新版本已发布','新加载或刷新页面读取同一版本。','查看预览'],
['PublishError','发布失败','Error','发布未完成','编辑内容保留；公开页继续用上一版本。','返回编辑'],
['Validation','待配置字段','Warning','发布校验未通过','请补成年提示、离开行为、联系信息与有效入口。','返回补全'],
['Unsaved','有未保存的修改','Warning','离开前保存','保存失败时保留当前内容。','保存并继续'],
['DeletePhoto','删除使用中的照片？','Warning','检查引用','草稿删除不影响上一公开版本。','确认删除草稿图片'],
['PasswordChanged','密码已修改','Success','原会话已失效','请使用新密码重新登录。','重新登录'],
['UploadError','照片上传失败','Error','格式或大小不符合要求','保留其他编辑内容；选择合规文件重试。','返回照片管理'],
['EmptyConfig','首次配置引导','Info','尚无有效目标地址','初始全部禁用；确认页保持可操作。','配置入口']
];
const feedbackIds={"Info":"28:28","Success":"28:31","Error":"28:34","Warning":"28:37"};const frames={},actions={};
for(const [i,[key,title,tone,short,detail,label]] of cases.entries()){
const f=artboard(page,'State/'+key,390,560,100+(i%4)*450,100+Math.floor(i/4)*680);
const c=box(f,'State content',350,'VERTICAL',20,0);c.layoutPositioning='ABSOLUTE';c.x=20;c.y=48;
text(c,title,'heading','text',350);
const comp=await figma.getNodeByIdAsync(feedbackIds[tone]);const banner=instance(c,comp,350);override(banner,short,'Title');override(banner,'请根据下方说明继续。','Detail');
text(c,detail,'body','muted',350);const action=instance(c,P,350,'Continue');override(action,label);
const cancel=instance(c,B,350,'Cancel');override(cancel,key==='Unsaved'?'继续编辑':key==='DeletePhoto'?'取消删除':'返回编辑');
frames[key]=f.id;actions[key]={primary:action.id,secondary:cancel.id};
}
note(page,'状态说明','本页状态为设计演示，不执行真实保存、发布、删除或登录。\n保存／发布失败不丢编辑内容；失败继续使用上一公开版本。未保存与删除操作须清楚确认。',1000,100,2220);
return {createdNodeIds,stateFrames:frames,stateActions:actions};
