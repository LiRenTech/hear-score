# 听谱 Hearscore

一个纯前端的音乐扒谱原型：上传音频后，在浏览器中运行 Spotify Basic Pitch，逐段显示音符，并提供钢琴卷帘、原音播放与 MIDI 导出。

## 本地启动

需要 Node.js 22.12+（推荐 Node.js 22 LTS）或 20.19+。

```bash
cd /Users/littlefean/Desktop/Projects/hear-score
npm install
npm run dev
```

打开终端显示的本地地址，默认是 http://127.0.0.1:5173。也可以双击项目里的 `启动听谱.command`。

```bash
npm test       # 音符拼接、WAV 和 MIDI 回归测试
npm run build # TypeScript 检查与生产构建
npm run preview # 预览构建产物
```

依赖安装后的 postinstall 脚本会把模型与 WASM 文件复制到 public；构建时随网站一起打包。模型不会从第三方 CDN 动态下载，不需要 API key、后端或付费服务。网页本身仍需要通过 HTTP 服务打开，不能直接双击 dist/index.html。

## 使用

1. 上传或拖入 MP3 / WAV；M4A、OGG、FLAC 的支持取决于浏览器解码器。当前限制为 50 MB、5 分钟。
2. 音频会解码、混为单声道、重采样至 22050 Hz，然后自动开始转录。首次使用加载本地模型；计算时间取决于设备。
3. 每处理约 6 秒音频会更新一次结果。可停止计算并保留已完成部分，或换文件取消旧任务。
4. 钢琴卷帘保留同时发声的音符。点击波形或卷帘跳转，支持原音播放和 0.5×、0.75×、1× 速度。
5. 调整音符强度过滤和最短时长，无需重新运行模型。颜色代表模型响应强度，不是经过校准的置信概率。
6. MIDI 导出保留当前过滤后的多声部与秒级时序，JSON 保存参数和原始时间。停止或计算中导出的文件标为部分转录。

## 能力边界

- 真实模型推理，不是根据文件名生成谱子。内置示例也会生成 WAV 后经过同一条解码 / 识别流程。
- Basic Pitch 更适合单一乐器、清晰独奏，支持复音，但不执行人声 / 乐器分轨。完整歌曲中的鼓声、混响、伴奏与人声可能造成错音、漏音或八度错误。
- 分块交界使用 0.5 秒上下文并合并连续音，仍可能误合并贴近边界的重复同音。
- 第一版没有音符拖拽编辑、MusicXML、PDF 导出、工程持久化。刷新页面会清空当前音频和结果。
- 支持现代桌面浏览器，推荐 Chrome / Edge；移动设备性能与内存可能限制长音频。WASM 失败时尝试 CPU 后端。
- 音频不发送到服务器。浏览器只请求站点静态资源、模型与 WASM 文件，无分析埋点、第三方字体或外部 API 请求。

## 实现结构

- React + TypeScript + Vite：界面与构建。
- Web Audio API：解码、混音、重采样、波形。
- `@spotify/basic-pitch` + TensorFlow.js / WASM：Worker 内复音识别。
- `@tonejs/midi`：MIDI 文件。
- `src/transcribe.worker.ts`：6 秒分块、上下文、推理及后台结果回传。每个块有 TensorFlow scope，限制 Basic Pitch 1.x 的中间张量占用。
- `src/lib/notes.ts`：分块拼接、过滤与导出。
- `src/lib/framing.ts`：与上游一致的补零分帧，修复 TFJS 3.x WASM Fill 的 dtype 兼容问题。
- `src/lib/audio.ts`：音频处理与合成测试旋律。
- `src/components/`：钢琴卷帘。

生产构建产物位于 `dist/`，可以部署到任何静态站点服务；模型及 WASM 文件须保持原路径。当前 Vite 配置以站点根路径部署。

## 已验证的真实歌曲

已用用户提供的《Promise》（4 分 40 秒 MP3）跑完整流程：修复 WASM 兼容问题后，在本机浏览器约半分钟内完成，默认过滤保留 3177 个候选音符；过滤强度 50% 时为 1148 个。数量不是准确率指标，仍需要人工校对。详见 `VALIDATION.md`。

## 上游资料与许可

- [Spotify Basic Pitch TypeScript](https://github.com/spotify/basic-pitch-ts)，Apache-2.0，模型来自其 npm 包。
- [TensorFlow.js](https://github.com/tensorflow/tfjs)，Apache-2.0。
- [Tone.js MIDI](https://github.com/Tonejs/Midi)，MIT。

第三方许可随各 npm 包保留；发布时请一并保留所用模型和依赖的许可声明。

## SEO 与站点地址

正式地址为 https://hear-score.lirentech.net/ 。首页 HTML 提供中文标题、描述、canonical、Open Graph / Twitter 分享信息和 WebApplication JSON-LD；首屏静态说明在 React 加载后由交互界面替换，界面侧栏保留功能说明与使用步骤。

`public/robots.txt` 允许抓取，并声明 `public/sitemap.xml` 中的首页地址。更换域名时需同步修改这两个文件及 `index.html` 中的 canonical、og:url 和结构化数据 URL。发布后可以向搜索引擎站长平台提交 `https://hear-score.lirentech.net/sitemap.xml`；收录和排名由搜索引擎决定。
