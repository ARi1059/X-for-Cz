const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
const gates={"Gate/First":"31:17","Gate/Expired":"31:27","Gate/Reset":"31:40","Gate/Storage":"31:53","Gate/Leaving":"31:66","Gate/ExitEmpty":"31:75","Gate/Loading":"31:84","Gate/Desktop":"31:97"},actions={"Gate/First":{"confirm":"31:23","exit":"31:25"},"Gate/Expired":{"confirm":"31:36","exit":"31:38"},"Gate/Reset":{"confirm":"31:49","exit":"31:51"},"Gate/Storage":{"confirm":"31:62","exit":"31:64"},"Gate/Loading":{"confirm":"31:93","exit":"31:95"}};
const home=await figma.getNodeByIdAsync('29:4'),loading=await figma.getNodeByIdAsync(gates['Gate/Loading']),exit=await figma.getNodeByIdAsync(gates['Gate/ExitEmpty']),reset=await figma.getNodeByIdAsync(gates['Gate/Reset']);
for(const [name,a] of Object.entries(actions)){if(name!=='Gate/Loading')await nav(await figma.getNodeByIdAsync(a.confirm),loading);await nav(await figma.getNodeByIdAsync(a.exit),exit)}
await nav(await figma.getNodeByIdAsync(actions['Gate/Loading'].confirm),home);
for(const id of Object.values({"Public/360":"30:35","Public/390":"30:55","Public/Desktop":"30:75"}))await nav(await figma.getNodeByIdAsync(id),reset);
const desktop=await figma.getNodeByIdAsync(gates['Gate/Desktop']);await nav(desktop.findOne(n=>n.name==='Confirm adult'),await figma.getNodeByIdAsync('29:6'));await nav(desktop.findOne(n=>n.name==='Leave'),exit);
page.flowStartingPoints=[{nodeId:gates['Gate/First'],name:'访客 · 成年声明到主页'},{nodeId:home.id,name:'主页 · 照片与重新确认'}];
return {mutatedNodeIds,edges:mutatedNodeIds.length};
