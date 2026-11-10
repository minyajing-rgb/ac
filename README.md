# 雪夜礼拜堂 · Alpine Chapel

一个可离线运行的网页互动原型。雪夜外景与烛光内景使用 AI 生成的 2:1 全景概念图，Three.js 将它们映射到可环视的球面空间；雪粒、微光和极光在实时 3D 场景中绘制。背景音乐使用 Scott Buckley 的《First Snow》，互动提示音由浏览器合成；无需账号或付款。

## 打开

解压后，在本文件夹运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:8765/>。需要支持 WebGL 和 Web Audio 的现代浏览器；运行时无需联网，也无需安装 npm 包。直接双击 `index.html` 可能因浏览器对本地模块的限制而无法载入，请使用本地服务。

## 操作

- 点击「步入雪夜」开始，音乐随之开启，可用右上角按钮关闭。
- 拖动鼠标或单指环视；滚轮或双指捏合缩放；点击画面聚焦并拉近。
- 点击教堂门前光点进入内景；点击左上角箭头或按 `Esc` 返回外景。
- 点击面板召唤极光、流星雨、带光的鸽子。极光与流星雨会引导视角抬向天空。
- 键盘 `1`、`2`、`3` 对应三种召唤；方向键环视；`+` 和 `-` 缩放；`E` 切换内外景。

## 当前版本的边界

这是**可玩的视觉原型**，用于确认场景氛围、交互节奏和特效方向。教堂建筑来自全景图，尚非可自由行走的高精度 3D 建筑模型；它也不是已验收的 AAA 商业游戏。两张 AI 全景图并非真实瑞士教堂的现场摄影，左右接缝及球面投影尚未达到无缝 VR 成品标准。正式制作仍需要实景采集或授权场景资产、建模、光照与性能优化、音效混音、跨设备验收。

## 文件与许可

- `assets/exterior.png`、`assets/interior.png`：AI 生成的雪夜教堂场景。
- `assets/spirit-dove.png`：AI 生成的透明发光鸽子特效素材。
- `assets/first-snow-scott-buckley.mp3`：Scott Buckley《First Snow》，CC BY 4.0。署名及许可链接见 `about.html#music-credit`，原曲见 <https://www.scottbuckley.com.au/library/first-snow/>。
- `vendor/three.module.js`、`vendor/three.core.js`：Three.js 0.180.0，MIT 许可见 `vendor/THREE_LICENSE.txt`。
- `index.html`、`style.css`、`main.js`：原型源文件。

线上版本目标地址：<https://ac.saga1001.com/>。实际可访问状态以域名解析和 HTTPS 验证为准。项目简介见 `about.html`。
