const page=await figma.getNodeByIdAsync('25:5');await figma.setCurrentPageAsync(page);
const home=await figma.getNodeByIdAsync('29:4'),second=await figma.getNodeByIdAsync('40:132');
await nav(home.findOne(n=>n.name==='Control ›'),second);
await nav(second.findOne(n=>n.name==='Control ‹'),home);
note(page,'原型规则','点击确认→处理中→点击处理按钮模拟成功响应。离开→未配置退出提示。照片箭头演示第一张／第二张切换。\n横向滑动、键盘与30天状态规则见交互说明，后续实现验证；本原型不连接真实外部URL。',1000,100,6300);
return {createdNodeIds,mutatedNodeIds};
